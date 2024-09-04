from flask import Blueprint, jsonify, request, abort, Response
from flask_caching import Cache
from models import db, Project, Task, TaskPred, TaskRsrc
from services import *
from sqlalchemy import text, func
import csv
from io import StringIO
import logging

api = Blueprint('api', __name__)
cache = Cache()

@api.route('/uploads')
@cache.cached(timeout=60)
def get_uploads():
    try:
        uploads = db.session.query(Task.xer_file_id).distinct().all()
        return jsonify([upload[0] for upload in uploads])
    except Exception as e:
        logging.error(f"Error fetching uploads: {str(e)}")
        return jsonify({"error": "Failed to fetch uploads"}), 500

@api.route('/projects')
@cache.cached(timeout=60, query_string=True)
def get_projects():
    try:
        xer_file_id = request.args.get('xer_file_id', type=int)
        if xer_file_id:
            projects = db.session.query(Task.proj_id, Project.proj_short_name).join(Project, Task.proj_id == Project.proj_id).filter_by(xer_file_id=xer_file_id).distinct().all()
        else:
            projects = Project.query.all()
        if not projects:
            return jsonify([]), 204
        return jsonify([{'id': project.proj_id, 'name': project.proj_short_name} for project in projects])
    except Exception as e:
        logging.error(f"Error fetching projects: {str(e)}")
        return jsonify({"error": "Failed to fetch projects"}), 500

@api.route('/graph')
@cache.cached(timeout=300, query_string=True)
def get_graph():
    try:
        xer_file_id = request.args.get('xer_file_id', type=int)
        proj_ids = request.args.getlist('proj_id')
        layout_type = request.args.get('layout', 'spring')
        node_count = request.args.get('node_count', default=50, type=int)

        logging.info(f"Received request for graph. xer_file_id: {xer_file_id}, proj_ids: {proj_ids}, layout: {layout_type}, node_count: {node_count}")

        if node_count < 25 or node_count > 1000:
            abort(400, description="node_count must be between 25 and 1000")

        if not proj_ids or (len(proj_ids) == 1 and proj_ids[0] == '[object Object]'):
            proj_ids = [proj[0] for proj in db.session.query(Task.proj_id).filter_by(xer_file_id=xer_file_id).distinct().all()]
            logging.info(f"No valid proj_ids provided. Using all projects for xer_file_id {xer_file_id}: {proj_ids}")

        G = nx.DiGraph()

        all_tasks = []
        for proj_id in proj_ids:
            tasks = Task.query.filter_by(xer_file_id=xer_file_id, proj_id=proj_id).all()
            all_tasks.extend(tasks)
            task_preds = TaskPred.query.filter_by(xer_file_id=xer_file_id, proj_id=proj_id).all()

            logging.info(f"For project {proj_id}: Found {len(tasks)} tasks and {len(task_preds)} task predecessors")

            for task in tasks:
                G.add_node(task.task_id, name=task.task_name, 
                           start=task.early_start_date, end=task.early_end_date,
                           float=task.total_float_hr_cnt, 
                           remaining_duration=task.remain_drtn_hr_cnt,
                           driving_path=task.driving_path_flag if hasattr(task, 'driving_path_flag') else 'N',
                           project=task.proj_id)

            for pred in task_preds:
                G.add_edge(pred.pred_task_id, pred.task_id, 
                           type=pred.pred_type, lag=pred.lag_hr_cnt)

        cost_data = db.session.query(
            Task.task_id,
            func.sum(func.coalesce(TaskRsrc.act_reg_cost, 0) + func.coalesce(TaskRsrc.act_ot_cost, 0)).label('actual_cost'),
            func.sum(func.coalesce(TaskRsrc.target_cost, 0)).label('target_cost'),
            func.sum(func.coalesce(TaskRsrc.remain_cost, 0)).label('remain_cost')
        ).outerjoin(TaskRsrc, (Task.task_id == TaskRsrc.task_id) & 
                      (Task.proj_id == TaskRsrc.proj_id) & 
                      (Task.xer_file_id == TaskRsrc.xer_file_id)) \
        .filter(Task.xer_file_id == xer_file_id, Task.proj_id.in_(proj_ids)) \
        .group_by(Task.task_id) \
        .all()

        cost_dict = {task.task_id: {'actual_cost': task.actual_cost, 'target_cost': task.target_cost, 'remain_cost': task.remain_cost} for task in cost_data}

        if not G.nodes:
            logging.warning(f"No tasks found for projects {proj_ids} in xer_file_id {xer_file_id}")
            return jsonify({"error": "No tasks found for the given projects"}), 204

        subgraph = select_nodes(G, node_count, proj_ids)

        # Add this check
        for node in subgraph.nodes():
            if 'name' not in subgraph.nodes[node]:
                logging.warning(f"Node {node} is missing 'name' attribute. Adding placeholder.")
                subgraph.nodes[node]['name'] = f"Task {node}"

        layout = calculate_graph_layout(subgraph, layout_type)

        levels = {}
        roots = [n for n in subgraph.nodes() if subgraph.in_degree(n) == 0]
        for root in roots:
            bfs_levels = nx.bfs_layers(subgraph, root)
            for level, nodes in enumerate(bfs_levels):
                for node in nodes:
                    levels[node] = max(levels.get(node, 0), level)

        nodes_data = []
        for node, data in subgraph.nodes(data=True):
            pred_count, succ_count = get_relationship_counts(node, xer_file_id, proj_ids)
            task = next((t for t in all_tasks if t.task_id == node), None)
            cost_info = cost_dict.get(node, {'actual_cost': 0, 'target_cost': 0, 'remain_cost': 0})
            hover_info = (
                f"Task: {data.get('name', f'Unknown Task {node}')}\n"
                f"Project: {data.get('project', 'Unknown')}\n"
                f"Start: {task.target_start_date if task else 'N/A'}\n"
                f"End: {task.target_end_date if task else 'N/A'}\n"
                f"Float: {data.get('float', 'N/A')}\n"
                f"Remaining Duration: {data.get('remaining_duration', 'N/A')}\n"
                f"On Driving Path: {'Yes' if data.get('driving_path') == 'Y' else 'No'}\n"
                f"Predecessors: {pred_count}\n"
                f"Successors: {succ_count}\n"
                f"Actual Cost: £{cost_info['actual_cost']:.2f}\n"
                f"Target Cost: £{cost_info['target_cost']:.2f}\n"
                f"Remaining Cost: £{cost_info['remain_cost']:.2f}"
            )
            node_data = {
                'id': node,
                'name': data.get('name', f'Unknown Task {node}'),
                'project': data.get('project', 'Unknown'),
                'start': data.get('start', 'N/A'),
                'end': data.get('end', 'N/A'),
                'float': data.get('float', 'N/A'),
                'remaining_duration': data.get('remaining_duration', 'N/A'),
                'driving_path': data.get('driving_path', 'N'),
                'level': levels.get(node, 0),
                'predecessors': pred_count,
                'successors': succ_count,
                'hover_info': hover_info,
                'x': layout[node]['x'],
                'y': layout[node]['y'],
                'actual_cost': float(cost_info['actual_cost']),
                'target_cost': float(cost_info['target_cost']),
                'remain_cost': float(cost_info['remain_cost'])
            }
            nodes_data.append(node_data)

        links_data = [{'source': u, 'target': v, 'type': data['type'], 'lag': data['lag']} 
                      for u, v, data in subgraph.edges(data=True)]

        key_start, key_end = identify_key_nodes(nodes_data)

        return jsonify({
            'nodes': nodes_data,
            'links': links_data,
            'layout_type': layout_type,
            'key_start_node': key_start['id'] if key_start else None,
            'key_end_node': key_end['id'] if key_end else None,
            'projects': proj_ids
        })
    except Exception as e:
        logging.error(f"Error generating graph: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to generate graph"}), 500

@api.route('/gantt_data')
@cache.cached(timeout=300, query_string=True)
def get_gantt_data():
    project_id = request.args.get('project_id')
    use_wbs = request.args.get('use_wbs', 'false').lower() == 'true'

    tasks = Task.query.filter_by(proj_id=project_id).all()
    dependencies = TaskPred.query.filter_by(proj_id=project_id).all()

    gantt_data = process_gantt_data(tasks, dependencies, use_wbs)

    return jsonify(gantt_data)

@api.route('/cost_dashboard/overall')
@cache.cached(timeout=300, query_string=True)
def get_overall_costs():
    try:
        xer_file_id = request.args.get('xer_file_id', type=int)
        proj_id = request.args.get('proj_id')

        query = text('''
            SELECT 
                SUM(COALESCE(tr.actual_cost, 0) + COALESCE(pc.actual_cost, 0)) AS total_actual_cost,
                SUM(COALESCE(tr.target_cost, 0) + COALESCE(pc.target_cost, 0)) AS total_target_cost,
                SUM(COALESCE(tr.remain_cost, 0) + COALESCE(pc.remain_cost, 0)) AS total_remain_cost
            FROM 
                TASK t
            LEFT JOIN (
                SELECT 
                    task_id, 
                    SUM(CAST(act_reg_cost AS FLOAT) + CAST(act_ot_cost AS FLOAT)) AS actual_cost,
                    SUM(CAST(target_cost AS FLOAT)) AS target_cost,
                    SUM(CAST(remain_cost AS FLOAT)) AS remain_cost
                FROM 
                    TASKRSRC
                WHERE
                    xer_file_id = :xer_file_id
                GROUP BY 
                    task_id
            ) tr ON t.task_id = tr.task_id
            LEFT JOIN (
                SELECT 
                    task_id, 
                    SUM(CAST(act_cost AS FLOAT)) AS actual_cost,
                    SUM(CAST(target_cost AS FLOAT)) AS target_cost,
                    SUM(CAST(remain_cost AS FLOAT)) AS remain_cost
                FROM 
                    PROJCOST
                WHERE
                    xer_file_id = :xer_file_id
                GROUP BY 
                    task_id
            ) pc ON t.task_id = pc.task_id
            WHERE 
                t.proj_id = :proj_id
                AND t.xer_file_id = :xer_file_id
        ''')

        result = db.session.execute(query, {'xer_file_id': xer_file_id, 'proj_id': proj_id}).fetchone()

        return jsonify({
            'total_actual_cost': float(result.total_actual_cost or 0),
            'total_target_cost': float(result.total_target_cost or 0),
            'total_remain_cost': float(result.total_remain_cost or 0)
        })
    except Exception as e:
        logging.error(f'Error fetching overall costs: {str(e)}')
        return jsonify({'error': 'Failed to fetch overall costs'}), 500

@api.route('/cost_dashboard/tasks')
@cache.cached(timeout=300, query_string=True)
def get_task_costs():
    try:
        xer_file_id = request.args.get('xer_file_id', type=int)
        proj_id = request.args.get('proj_id')

        query = text('''
            SELECT 
                t.task_id,
                t.task_name,
                COALESCE(SUM(CAST(tr.act_reg_cost AS FLOAT) + CAST(tr.act_ot_cost AS FLOAT)), 0) AS actual_cost,
                COALESCE(SUM(CAST(tr.target_cost AS FLOAT)), 0) AS target_cost,
                COALESCE(SUM(CAST(tr.remain_cost AS FLOAT)), 0) AS remain_cost
            FROM 
                TASK t
            LEFT JOIN 
                TASKRSRC tr ON t.task_id = tr.task_id AND t.proj_id = tr.proj_id
            WHERE 
                t.proj_id = :proj_id
                AND t.xer_file_id = :xer_file_id
                AND tr.xer_file_id = :xer_file_id
            GROUP BY 
                t.task_id, t.task_name
            HAVING
                (COALESCE(SUM(CAST(tr.act_reg_cost AS FLOAT) + CAST(tr.act_ot_cost AS FLOAT)), 0) + 
                 COALESCE(SUM(CAST(tr.target_cost AS FLOAT)), 0) + 
                 COALESCE(SUM(CAST(tr.remain_cost AS FLOAT)), 0)) > 0
            ORDER BY 
                actual_cost DESC
        ''')

        results = db.session.execute(query, {'xer_file_id': xer_file_id, 'proj_id': proj_id}).fetchall()

        return jsonify([{
            'task_id': row.task_id,
            'task_name': row.task_name,
            'actual_cost': float(row.actual_cost),
            'target_cost': float(row.target_cost),
            'remain_cost': float(row.remain_cost)
        } for row in results])
    except Exception as e:
        logging.error(f'Error fetching task costs: {str(e)}')
        return jsonify({'error': 'Failed to fetch task costs'}), 500

@api.route('/cost_dashboard/resources')
@cache.cached(timeout=300, query_string=True)
def get_resource_costs():
    try:
        xer_file_id = request.args.get('xer_file_id', type=int)
        proj_id = request.args.get('proj_id')

        query = text('''
            SELECT 
                r.rsrc_id,
                r.rsrc_name,
                r.rsrc_type,
                COALESCE(SUM(CAST(tr.act_reg_cost AS FLOAT) + CAST(tr.act_ot_cost AS FLOAT)), 0) AS actual_cost,
                COALESCE(SUM(CAST(tr.target_cost AS FLOAT)), 0) AS target_cost,
                COALESCE(SUM(CAST(tr.remain_cost AS FLOAT)), 0) AS remain_cost
            FROM 
                RSRC r
            JOIN 
                TASKRSRC tr ON r.rsrc_id = tr.rsrc_id
            JOIN
                TASK t ON tr.task_id = t.task_id
            WHERE 
                t.proj_id = :proj_id
                AND tr.xer_file_id = :xer_file_id
                AND t.xer_file_id = :xer_file_id
            GROUP BY 
                r.rsrc_id, r.rsrc_name, r.rsrc_type
            ORDER BY
                actual_cost DESC
        ''')

        results = db.session.execute(query, {'xer_file_id': xer_file_id, 'proj_id': proj_id}).fetchall()

        return jsonify([{
            'rsrc_id': row.rsrc_id,
            'rsrc_name': row.rsrc_name,
            'rsrc_type': row.rsrc_type,
            'actual_cost': float(row.actual_cost),
            'target_cost': float(row.target_cost),
            'remain_cost': float(row.remain_cost)
        } for row in results])
    except Exception as e:
        logging.error(f'Error fetching resource costs: {str(e)}')
        return jsonify({'error': 'Failed to fetch resource costs'}), 500

@api.route('/cost_dashboard/forecast')
@cache.cached(timeout=300, query_string=True)
def get_cost_forecast():
    try:
        xer_file_id = request.args.get('xer_file_id', type=int)
        proj_id = request.args.get('proj_id')
        time_period = request.args.get('time_period', default='monthly')
        
        # Validate time_period
        if time_period not in ['monthly', 'quarterly', 'yearly']:
            return jsonify({'error': 'Invalid time period'}), 400

        query = text('''
            SELECT 
                CASE 
                    WHEN :time_period = 'monthly' THEN strftime('%Y-%m', t.target_start_date)
                    WHEN :time_period = 'quarterly' THEN strftime('%Y-Q', t.target_start_date) || ((cast(strftime('%m', t.target_start_date) as integer) + 2) / 3)
                    WHEN :time_period = 'yearly' THEN strftime('%Y', t.target_start_date)
                END AS period,
                SUM(COALESCE(tr.act_reg_cost, 0) + COALESCE(tr.act_ot_cost, 0)) AS actual_cost,
                SUM(COALESCE(tr.target_cost, 0)) AS target_cost
            FROM 
                TASK t
            LEFT JOIN 
                TASKRSRC tr ON t.task_id = tr.task_id AND t.proj_id = tr.proj_id
            WHERE 
                t.proj_id = :proj_id
                AND t.xer_file_id = :xer_file_id
                AND tr.xer_file_id = :xer_file_id
            GROUP BY 
                period
            ORDER BY 
                period
        ''')

        results = db.session.execute(query, {
            'xer_file_id': xer_file_id, 
            'proj_id': proj_id, 
            'time_period': time_period
        }).fetchall()

        forecast_data = [{
            'period': row.period,
            'actual_cost': float(row.actual_cost),
            'target_cost': float(row.target_cost)
        } for row in results]

        return jsonify(forecast_data)
    except Exception as e:
        logging.error(f'Error fetching cost forecast: {str(e)}')
        return jsonify({'error': 'Failed to fetch cost forecast'}), 500

@api.route('/cost_dashboard/export_forecast')
@cache.cached(timeout=300, query_string=True)
def export_forecast():
    try:
        xer_file_id = request.args.get('xer_file_id', type=int)
        proj_id = request.args.get('proj_id')
        time_period = request.args.get('time_period', default='monthly')
        
        if time_period not in ['monthly', 'quarterly', 'yearly']:
            return jsonify({'error': 'Invalid time period'}), 400

        query = text('''
            SELECT 
                CASE 
                    WHEN :time_period = 'monthly' THEN strftime('%Y-%m', t.target_start_date)
                    WHEN :time_period = 'quarterly' THEN strftime('%Y-Q', t.target_start_date) || ((cast(strftime('%m', t.target_start_date) as integer) + 2) / 3)
                    WHEN :time_period = 'yearly' THEN strftime('%Y', t.target_start_date)
                END AS period,
                SUM(COALESCE(tr.act_reg_cost, 0) + COALESCE(tr.act_ot_cost, 0)) AS actual_cost,
                SUM(COALESCE(tr.target_cost, 0)) AS target_cost
            FROM 
                TASK t
            LEFT JOIN 
                TASKRSRC tr ON t.task_id = tr.task_id AND t.proj_id = tr.proj_id
            WHERE 
                t.proj_id = :proj_id
                AND t.xer_file_id = :xer_file_id
                AND tr.xer_file_id = :xer_file_id
            GROUP BY 
                period
            ORDER BY 
                period
        ''')

        results = db.session.execute(query, {
            'xer_file_id': xer_file_id, 
            'proj_id': proj_id, 
            'time_period': time_period
        }).fetchall()

        # Prepare CSV data
        output = StringIO()
        writer = csv.writer(output)
        
        # Prepare headers and data
        if results:
            headers = ['Cost Type'] + [row.period for row in results]
            actual_costs = ['Actual'] + [row.actual_cost for row in results]
            target_costs = ['Target'] + [row.target_cost for row in results]
            
            # Write data
            writer.writerow(headers)
            writer.writerow(actual_costs)
            writer.writerow(target_costs)
        else:
            writer.writerow(['No data available for the selected criteria'])

        # Prepare response
        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-disposition': f'attachment; filename=cost_forecast_{time_period}.csv'}
        )

    except Exception as e:
        logging.error(f'Error exporting cost forecast: {str(e)}')
        return jsonify({'error': 'Failed to export cost forecast'}), 500

@api.route('/movement_comparison')
@cache.cached(timeout=300, query_string=True)
def movement_comparison():
    try:
        upload_id_1 = request.args.get('upload_id_1', type=int)
        upload_id_2 = request.args.get('upload_id_2', type=int)
        proj_id = request.args.get('proj_id')
        comparison_method = request.args.get('comparison_method', 'id')

        if not all([upload_id_1, upload_id_2]):
            return jsonify({'error': 'Missing required parameters'}), 400

        comparison_data = compare_uploads(upload_id_1, upload_id_2, proj_id, comparison_method)
        
        summary = {
            'total_changes': len(comparison_data),
            'added_tasks': sum(1 for item in comparison_data if 'added' in item['changes']),
            'removed_tasks': sum(1 for item in comparison_data if 'removed' in item['changes']),
            'cost_changes': sum(1 for item in comparison_data if 'cost' in item['changes'])
        }
        
        return jsonify({'summary': summary, 'details': comparison_data})
    except Exception as e:
        logging.error(f'Error comparing uploads: {str(e)}')
        return jsonify({'error': 'Failed to compare uploads'}), 500
