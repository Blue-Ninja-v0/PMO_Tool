from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'USER'
    user_id = db.Column(db.Integer, primary_key=True)
    user_name = db.Column(db.String)
    user_email = db.Column(db.String)
    user_password = db.Column(db.String)

class Project(db.Model):
    __tablename__ = 'PROJECT'
    proj_id = db.Column(db.String, primary_key=True)
    proj_short_name = db.Column(db.String)
    xer_file_id = db.Column(db.Integer)

    # Nullable foreign key linking to the User table
    user_id = db.Column(db.Integer, db.ForeignKey('USER.user_id'), nullable=True)

    # Relationship to access the User object from the Project object
    user = db.relationship('User', backref='projects')

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
