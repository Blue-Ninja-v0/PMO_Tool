from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text, func

db = SQLAlchemy()

class Project(db.Model):
    __tablename__ = 'PROJECT'
    proj_id = db.Column(db.String, primary_key=True)
    proj_short_name = db.Column(db.String)
    xer_file_id = db.Column(db.Integer)

class Task(db.Model):
    __tablename__ = 'TASK'
    task_id = db.Column(db.String, primary_key=True)
    proj_id = db.Column(db.String)
    task_name = db.Column(db.String)
    early_start_date = db.Column(db.String)
    early_end_date = db.Column(db.String)
    target_start_date = db.Column(db.String)
    target_end_date = db.Column(db.String)
    total_float_hr_cnt = db.Column(db.Float)
    remain_drtn_hr_cnt = db.Column(db.Float)
    driving_path_flag = db.Column(db.String)
    xer_file_id = db.Column(db.Integer)
    wbs_id = db.Column(db.String)

class TaskPred(db.Model):
    __tablename__ = 'TASKPRED'
    task_pred_id = db.Column(db.String, primary_key=True)
    task_id = db.Column(db.String)
    pred_task_id = db.Column(db.String)
    proj_id = db.Column(db.String)
    pred_type = db.Column(db.String)
    lag_hr_cnt = db.Column(db.Float)
    xer_file_id = db.Column(db.Integer)

class TaskRsrc(db.Model):
    __tablename__ = 'TASKRSRC'
    taskrsrc_id = db.Column(db.String, primary_key=True)
    task_id = db.Column(db.String)
    proj_id = db.Column(db.String)
    rsrc_id = db.Column(db.String)
    act_reg_cost = db.Column(db.Float)
    act_ot_cost = db.Column(db.Float)
    target_cost = db.Column(db.Float)
    remain_cost = db.Column(db.Float)
    xer_file_id = db.Column(db.Integer)
