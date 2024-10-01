from models import db, Project, Task, TaskPred, TaskRsrc
from sqlalchemy import text, func
import networkx as nx
from dateutil.parser import parser
from datetime import datetime
import logging

def identify_key_nodes(nodes_data):
    if not nodes_data:
        return None, None

    def parse_date(date_string):
        if date_string and date_string not in ['N/A', '']:
            try:
                return parser.parse(date_string)
            except ValueError:
                return None
        return None

    valid_nodes = [node for node in nodes_data if parse_date(node.get('start')) and parse_date(node.get('end'))]
    if not valid_nodes:
        return None, None

    start_nodes = sorted(valid_nodes, key=lambda x: (parse_date(x.get('start')) or datetime.max, -x.get('successors', 0)))
    latest_end_date = max((parse_date(x.get('end')) for x in valid_nodes), default=None)

    end_nodes = [x for x in valid_nodes if parse_date(x.get('end')) == latest_end_date]
    end_nodes.sort(key=lambda x: x.get('predecessors', 0), reverse=True)

    key_start = start_nodes[0] if start_nodes else None
    key_end = end_nodes[0] if end_nodes else None

    return key_start, key_end

def calculate_graph_layout(subgraph, layout_type='spring'):
    try:
        if layout_type == 'spring':
            pos = nx.spring_layout(subgraph, k=0.5, iterations=50, scale=2)
        elif layout_type == 'spectral':
            pos = nx.spectral_layout(subgraph)
        else:
            logging.warning(f'Unknown layout type: {layout_type}. Falling back to spring layout.')
            pos = nx.spring_layout(subgraph, k=0.5, iterations=50, scale=2)
    except Exception as e:
        logging.error(f'Error calculating graph layout: {str(e)}. Falling back to spring layout.')
        pos = nx.spring_layout(subgraph, k=0.5, iterations=50, scale=2)

    levels = nx.get_node_attributes(subgraph, 'level')
    max_level = max(levels.values()) if levels else 1
    for node in pos:
        pos[node] = (pos[node][0], levels.get(node, 0) / max_level)

    return {node: {'x': float(coord[0]), 'y': float(coord[1])} for node, coord in pos.items()}

def get_relationship_counts(task_id, xer_file_id, proj_ids):
    pred_count = db.session.query(db.func.count(TaskPred.task_pred_id)).filter(
        TaskPred.task_id == task_id,
        TaskPred.xer_file_id == xer_file_id,
        TaskPred.proj_id.in_(proj_ids)
    ).scalar()
    succ_count = db.session.query(db.func.count(TaskPred.task_pred_id)).filter(
        TaskPred.pred_task_id == task_id,
        TaskPred.xer_file_id == xer_file_id,
        TaskPred.proj_id.in_(proj_ids)
    ).scalar()
    return pred_count, succ_count

def select_nodes(G, node_count, proj_ids):
    def float_value(x):
        if isinstance(x, (int, float)):
            return float(x)
        elif isinstance(x, str):
            try:
                return float(x)
            except ValueError:
                return float('inf')
        else:
            return float('inf')

    important_nodes = []
    for node, data in G.nodes(data=True):
        if data.get('driving_path') == 'Y' or (
            data.get('float') is not None and 
            float_value(data.get('float')) < 40
        ):
            important_nodes.append(node)

    logging.info(f'Found {len(important_nodes)} important nodes before filtering')

    projects = set(data.get('project') for _, data in G.nodes(data=True))
    nodes_per_project = max(1, node_count // len(projects))

    filtered_important_nodes = []
    for project in projects:
        project_nodes = [node for node in important_nodes if G.nodes[node].get('project') == project]
        filtered_important_nodes.extend(project_nodes[:nodes_per_project])

    logging.info(f'Selected {len(filtered_important_nodes)} nodes after balancing across projects')

    if len(filtered_important_nodes) > node_count:
        try:
            filtered_important_nodes = sorted(filtered_important_nodes, 
                                              key=lambda n: (G.nodes[n].get('driving_path') == 'Y', 
                                                             -float_value(G.nodes[n].get('float', float('inf'))),
                                                             len(list(G.predecessors(n)))), 
                                              reverse=True)[:node_count]
        except Exception as e:
            logging.error(f'Error sorting nodes: {str(e)}')
            filtered_important_nodes = filtered_important_nodes[:node_count]

    subgraph_nodes = set(filtered_important_nodes)
    for node in filtered_important_nodes:
        subgraph_nodes.update(G.predecessors(node))
        subgraph_nodes.update(G.successors(node))

    logging.info(f'Final subgraph contains {len(subgraph_nodes)} nodes')
    return G.subgraph(subgraph_nodes).copy()

def map_relationship_type(pred_type):
    type_map = {
        'FS': '0',
        'SS': '1',
        'FF': '2',
        'SF': '3'
    }
    return type_map.get(pred_type, '0')

def parse_and_format_date(date_string):
    if date_string:
        try:
            dt = datetime.strptime(date_string, '%Y-%m-%d %H:%M')
            return dt.strftime('%Y-%m-%d %H:%M:%S')
        except ValueError:
            return None
    return None

def process_gantt_data(tasks, dependencies, use_wbs=False):
    def parse_date(date_string):
        if date_string and date_string not in ['N/A', '']:
            try:
                return parser.parse(date_string)
            except ValueError:
                return None
        return None

    if use_wbs:
        sorted_tasks = sorted(tasks, key=lambda x: (x.wbs_id or '', parse_date(x.early_end_date) or datetime.max))
    else:
        sorted_tasks = sorted(tasks, key=lambda x: parse_date(x.early_end_date) or datetime.max)

    processed_tasks = []
    for task in sorted_tasks:
        try:
            remain_drtn = float(task.remain_drtn_hr_cnt) if task.remain_drtn_hr_cnt else 0
            total_float = float(task.total_float_hr_cnt) if task.total_float_hr_cnt else 0
            progress = 1 - (remain_drtn / total_float) if total_float > 0 else 0
        except ValueError:
            progress = 0

        processed_tasks.append({
            'id': task.task_id,
            'text': task.task_name,
            'start_date': parse_and_format_date(task.early_start_date),
            'end_date': parse_and_format_date(task.early_end_date),
            'progress': max(0, min(1, progress)),
            'color': '#FFB3BA' if task.driving_path_flag == 'Y' else '#AEC6CF',
            'text_style': 'bold' if task.driving_path_flag == 'Y' else 'normal',
            'wbs_id': task.wbs_id
        })

    processed_links = []
    for dep in dependencies:
        processed_links.append({
            'id': dep.task_pred_id,
            'source': dep.pred_task_id,
            'target': dep.task_id,
            'type': map_relationship_type(dep.pred_type)
        })

    return {
        'data': processed_tasks,
        'links': processed_links
    }

def compare_uploads(upload_id_1, upload_id_2, proj_id, comparison_method='id'):
    tasks_1 = Task.query.filter(Task.xer_file_id == upload_id_1, Task.proj_id == proj_id).all()
    tasks_2 = Task.query.filter(Task.xer_file_id == upload_id_2, Task.proj_id == proj_id).all()

    if comparison_method == 'id':
        task_dict_1 = {task.task_id: task for task in tasks_1}
        task_dict_2 = {task.task_id: task for task in tasks_2}
    else:  # comparison by name
        task_dict_1 = {task.task_name: task for task in tasks_1}
        task_dict_2 = {task.task_name: task for task in tasks_2}

    task_keys = set(task_dict_1.keys()) | set(task_dict_2.keys())

    comparison = []
    for task_key in task_keys:
        task_1 = task_dict_1.get(task_key)
        task_2 = task_dict_2.get(task_key)

        if task_1 and task_2:
            cost_1 = get_cost_values(task_1.task_id, upload_id_1, proj_id)
            cost_2 = get_cost_values(task_2.task_id, upload_id_2, proj_id)
            if compare_cost_values(cost_1, cost_2):
                comparison.append({
                    'task_id': task_1.task_id,
                    'task_name': task_1.task_name,
                    'project': task_1.proj_id,
                    'changes': ['cost'],
                    'old_values': {'cost': cost_1},
                    'new_values': {'cost': cost_2}
                })
        elif task_1:
            comparison.append({
                'task_id': task_1.task_id,
                'task_name': task_1.task_name,
                'project': task_1.proj_id,
                'changes': ['removed'],
                'old_values': {
                    'cost': get_cost_values(task_1.task_id, upload_id_1, proj_id)
                }
            })
        elif task_2:
            comparison.append({
                'task_id': task_2.task_id,
                'task_name': task_2.task_name,
                'project': task_2.proj_id,
                'changes': ['added'],
                'new_values': {
                    'cost': get_cost_values(task_2.task_id, upload_id_2, proj_id)
                }
            })

    return comparison

def get_cost_values(task_id, xer_file_id, proj_id):
    query = text('''
        SELECT 
            COALESCE(SUM(COALESCE(act_reg_cost, 0) + COALESCE(act_ot_cost, 0)), 0) as actual_cost,
            COALESCE(SUM(COALESCE(target_cost, 0)), 0) as target_cost,
            COALESCE(SUM(COALESCE(remain_cost, 0)), 0) as remain_cost
        FROM 
            TASKRSRC
        WHERE 
            task_id = :task_id AND
            xer_file_id = :xer_file_id AND
            proj_id = :proj_id
    ''')
    result = db.session.execute(query, {'task_id': task_id, 'xer_file_id': xer_file_id, 'proj_id': proj_id}).fetchone()
    return {
        'actual': float(result.actual_cost),
        'target': float(result.target_cost),
        'remain': float(result.remain_cost)
    }

def compare_cost_values(cost1, cost2):
    # Use a small threshold (0.01) to account for floating-point precision issues
    return (abs(cost1['actual'] - cost2['actual']) > 0.01 or 
            abs(cost1['target'] - cost2['target']) > 0.01 or 
            abs(cost1['remain'] - cost2['remain']) > 0.01)

def calculate_date_difference(date1, date2):
    if date1 and date2:
        d1 = datetime.strptime(date1, '%Y-%m-%d %H:%M')
        d2 = datetime.strptime(date2, '%Y-%m-%d %H:%M')
        return (d2 - d1).days
    return None

def sum_task_costs(tasks):
    total_actual = sum(task.actual_cost for task in tasks if task.actual_cost)
    total_target = sum(task.target_cost for task in tasks if task.target_cost)
    total_remain = sum(task.remain_cost for task in tasks if task.remain_cost)
    return total_actual, total_target, total_remain