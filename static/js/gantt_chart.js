function parseDate(dateString) {
    if (dateString) {
        return new Date(dateString);
    }
    return null;
}

// Load projects
fetch('/api/projects')
    .then(response => response.json())
    .then(projects => {
        const select = document.getElementById('project-select');
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            select.appendChild(option);
        });
    });

// Initialize Gantt chart
gantt.init("gantt_here");

// Initialize zoom configuration
gantt.ext.zoom.init({
    levels: [
        {
            name: "Day",
            scale_height: 60,
            min_column_width: 30,
            scales: [
                { unit: "day", step: 1, format: "%d %M" }
            ]
        },
        {
            name: "Week",
            scale_height: 60,
            min_column_width: 50,
            scales: [
                { unit: "week", step: 1, format: "Week #%W" },
                { unit: "day", step: 1, format: "%D" }
            ]
        },
        {
            name: "Month",
            scale_height: 60,
            min_column_width: 120,
            scales: [
                { unit: "month", step: 1, format: "%F, %Y" },
                { unit: "week", step: 1, format: "Week #%W" }
            ]
        }
    ]
});

let originalData = null;
let useWBS = false;

// Load Gantt data when a project is selected
function loadGanttData() {
    const projectId = document.getElementById('project-select').value;
    if (projectId) {
        console.log('Loading Gantt data with use_wbs:', useWBS);
        fetch(`/api/gantt_data?project_id=${projectId}&use_wbs=${useWBS}`)
            .then(response => response.json())
            .then(data => {
                console.log('Received Gantt data:', data);
                // Parse dates in the data
                data.data.forEach(task => {
                    task.start_date = parseDate(task.start_date);
                    task.end_date = parseDate(task.end_date);
                    task.color = task.color || '#AEC6CF';
                    task.text_style = task.text_style || 'normal';
                });
                originalData = data;
                applyFilters();
                configureGantt();
            });
    }
}

document.getElementById('project-select').addEventListener('change', loadGanttData);

function toggleWBSView() {
    useWBS = !useWBS;
    console.log('WBS view toggled:', useWBS);
    document.getElementById('wbs-toggle').textContent = useWBS ? 'Disable WBS' : 'Enable WBS';
    loadGanttData();
}

function applyFilters() {
    if (!originalData) return;

    const filteredData = {
        data: originalData.data.filter(task => {
            const projectFilter = document.getElementById('filter-project').value;
            const nameFilter = document.getElementById('filter-task-name').value.toLowerCase();
            const statusFilter = document.getElementById('filter-status').value;
            const drivingPathFilter = document.getElementById('filter-driving-path').checked;

            return (
                (!projectFilter || task.project === projectFilter) &&
                (!nameFilter || task.text.toLowerCase().includes(nameFilter)) &&
                (!statusFilter || (
                    (statusFilter === 'in_progress' && task.progress > 0 && task.progress < 1) ||
                    (statusFilter === 'completed' && task.progress === 1)
                )) &&
                (!drivingPathFilter || task.color === '#FFB3BA')
            );
        }),
        links: originalData.links
    };

    gantt.clearAll();
    gantt.parse(filteredData);
    configureGantt();
}

// Customize Gantt appearance
gantt.templates.task_class = function(start, end, task){
    let classes = [];
    if(task.color === '#FFB3BA') {
        classes.push("driving-path-task");
    }
    if(task.text_style === 'bold') {
        classes.push("bold-task");
    }
    return classes.join(" ");
};

gantt.templates.task_text = function(start, end, task){
    if(task.text_style === 'bold') {
        return "<strong>" + task.text + "</strong>";
    }
    return task.text;
};

// Add custom CSS
const style = document.createElement('style');
style.textContent = `
    .driving-path-task .gantt_task_progress {
        background-color: #FFB3BA;
    }
    .driving-path-task .gantt_task_content {
        color: #000000;
    }
    .bold-task .gantt_task_content {
        font-weight: bold;
    }
`;
document.head.appendChild(style);

// Update Gantt chart configuration to use the parsed dates
gantt.config.date_format = "%Y-%m-%d %H:%i:%s";

// Configure custom filter method
gantt.config.layout = {
    css: 'gantt_container',
    rows: [
        {
            cols: [
                {view: 'grid', id: 'grid', width: 400},
                {resizer: true, width: 1},
                {view: 'timeline', id: 'timeline', scrollX: 'scrollHor', scrollY: 'scrollVer'},
                {view: 'scrollbar', id: 'scrollVer'}
            ]
        },
        {view: 'scrollbar', id: 'scrollHor'}
    ]
};

gantt.config.columns = [
    {name: 'add', label: '', width: 44},
    {name: 'text', label: 'Task name', tree: true, width: 200},
    {name: 'start_date', label: 'Start time', align: 'center', width: 120},
    {name: 'duration', label: 'Duration', align: 'center', width: 100}
];

gantt.config.filter_task = function(id, task) {
    const projectFilter = document.getElementById('filter-project').value;
    const nameFilter = document.getElementById('filter-task-name').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    const drivingPathFilter = document.getElementById('filter-driving-path').checked;

    return (
        (!projectFilter || task.project === projectFilter) &&
        (!nameFilter || task.text.toLowerCase().includes(nameFilter)) &&
        (!statusFilter || (
            (statusFilter === 'in_progress' && task.progress > 0 && task.progress < 1) ||
            (statusFilter === 'completed' && task.progress === 1)
        )) &&
        (!drivingPathFilter || task.color === '#FFB3BA')
    );
};

function configureGantt() {
    console.log('Configuring Gantt with useWBS:', useWBS);
    if (useWBS) {
        gantt.groupBy({
            groups: ['wbs_id'],
            group_id: 'wbs_id',
            group_text: function(wbs_id) {
                return 'WBS: ' + wbs_id;
            },
            group_task: 'parent',
            group_render: 'header_row'
        });
        gantt.config.layout = {
            css: 'gantt_container',
            rows: [
                {
                    cols: [
                        {view: 'grid', group: 'grids'},
                        {resizer: true, width: 1},
                        {view: 'timeline', group: 'timeline'},
                        {view: 'scrollbar', id: 'scrollVer'}
                    ]
                },
                {view: 'scrollbar', id: 'scrollHor'}
            ]
        };
    } else {
        gantt.groupBy(false);
        gantt.config.layout = {
            css: 'gantt_container',
            rows: [
                {
                    cols: [
                        {view: 'grid', id: 'grid', width: 300},
                        {resizer: true, width: 1},
                        {view: 'timeline', id: 'timeline', scrollX: 'scrollHor', scrollY: 'scrollVer'},
                        {view: 'scrollbar', id: 'scrollVer'}
                    ]
                },
                {view: 'scrollbar', id: 'scrollHor'}
            ]
        };
    }
    gantt.render();
}

// Setup zoom and pan controls
function zoomIn() {
    gantt.ext.zoom.zoomIn();
}

function zoomOut() {
    gantt.ext.zoom.zoomOut();
}

function panLeft() {
    gantt.scrollTo(gantt.getScrollState().x - 100, null);
}

function panRight() {
    gantt.scrollTo(gantt.getScrollState().x + 100, null);
}

function panUp() {
    gantt.scrollTo(null, gantt.getScrollState().y - 100);
}

function panDown() {
    gantt.scrollTo(null, gantt.getScrollState().y + 100);
}

function resetView() {
    gantt.ext.zoom.setLevel("Month");
    gantt.showDate(new Date());
}

function exportSVG() {
    const svg = gantt.exportToSVG();
    const svgBlob = new Blob([svg], {type: 'image/svg+xml;charset=utf-8'});
    saveAs(svgBlob, 'gantt_chart.svg');
}

function shareGantt() {
    const state = gantt.serialize();
    const stateJSON = JSON.stringify(state);
    const encodedState = encodeURIComponent(stateJSON);
    const shareableUrl = `${window.location.origin}${window.location.pathname}?state=${encodedState}`;
    
    navigator.clipboard.writeText(shareableUrl).then(() => {
        alert('Shareable link copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy shareable link. Please try again.');
    });
}

// Add event listeners for control buttons
document.getElementById('zoom-in').addEventListener('click', zoomIn);
document.getElementById('zoom-out').addEventListener('click', zoomOut);
document.getElementById('pan-left').addEventListener('click', panLeft);
document.getElementById('pan-right').addEventListener('click', panRight);
document.getElementById('pan-up').addEventListener('click', panUp);
document.getElementById('pan-down').addEventListener('click', panDown);
document.getElementById('reset-view').addEventListener('click', resetView);
document.getElementById('export-svg').addEventListener('click', exportSVG);
document.getElementById('share-graph').addEventListener('click', shareGantt);

// Add event listeners for filter controls
document.getElementById('filter-project').addEventListener('change', applyFilters);
document.getElementById('filter-task-name').addEventListener('input', applyFilters);
document.getElementById('filter-status').addEventListener('change', applyFilters);
document.getElementById('filter-driving-path').addEventListener('change', applyFilters);
document.getElementById('apply-filters').addEventListener('click', applyFilters);
document.getElementById('wbs-toggle').addEventListener('click', toggleWBSView);

function addTask(item) {
    var task = {
        id: gantt.uid(),
        text: 'New task',
        start_date: new Date(),
        duration: 1,
        wbs_id: item.wbs_id // Inherit WBS ID from parent or group
    };
    gantt.addTask(task, item.parent);
}

gantt.config.buttons_left = ['dhx_save_btn', 'dhx_cancel_btn', 'add_task'];
gantt.locale.labels['add_task'] = 'Add task';
gantt.attachEvent('onLightboxButton', function(button_id, node, e) {
    if (button_id == 'add_task') {
        var task = gantt.getTask(gantt.getState().lightbox);
        addTask(task);
    }
});