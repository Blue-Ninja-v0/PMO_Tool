document.addEventListener('DOMContentLoaded', initialize);

function initialize() {
    fetchUploads();
    setupEventListeners();
}

function fetchUploads() {
    fetch('/api/uploads')
        .then(response => response.json())
        .then(populateUploadSelects)
        .catch(error => console.error('Error fetching uploads:', error));
}

function populateUploadSelects(uploads) {
    const uploadSelect1 = document.getElementById('upload-select-1');
    const uploadSelect2 = document.getElementById('upload-select-2');
    
    uploads.forEach(upload => {
        const option1 = document.createElement('option');
        const option2 = document.createElement('option');
        option1.value = option2.value = upload;
        option1.textContent = option2.textContent = `Upload ${upload}`;
        uploadSelect1.appendChild(option1);
        uploadSelect2.appendChild(option2);
    });
}

function setupEventListeners() {
    document.getElementById('compare-uploads').addEventListener('click', compareUploads);
    document.getElementById('upload-select-1').addEventListener('change', fetchProjects);
    document.getElementById('upload-select-2').addEventListener('change', fetchProjects);
    document.getElementById('task-filter').addEventListener('input', applyFilters);
    document.getElementById('change-type-filter').addEventListener('change', applyFilters);
    document.getElementById('cost-change-filter').addEventListener('change', applyFilters);
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.querySelectorAll('input[name="comparison-method"]').forEach(radio => {
        radio.addEventListener('change', compareUploads);
    });
    document.getElementById('export-csv').addEventListener('click', exportToCSV);
}

function compareUploads() {
    const uploadId1 = document.getElementById('upload-select-1').value;
    const uploadId2 = document.getElementById('upload-select-2').value;
    const projId = document.getElementById('project-select').value;
    const comparisonMethod = document.querySelector('input[name="comparison-method"]:checked').value;
    
    if (!uploadId1 || !uploadId2 || !projId) {
        alert('Please select two uploads and a project to compare.');
        return;
    }
    
    fetch(`/api/movement_comparison?upload_id_1=${uploadId1}&upload_id_2=${uploadId2}&proj_id=${projId}&comparison_method=${comparisonMethod}`)
        .then(response => response.json())
        .then(data => {
            window.comparisonData = data.details;
            displayComparisonSummary(data.summary);
            analyzeComparison(data.details);
            applyFilters();
        })
        .catch(error => console.error('Error fetching comparison data:', error));
}

function analyzeComparison(details) {
    const costChanges = details.filter(item => item.changes.includes('cost'));
    const addedTasks = details.filter(item => item.changes.includes('added'));
    const removedTasks = details.filter(item => item.changes.includes('removed'));

    const totalCostChange = costChanges.reduce((total, item) => {
        const oldCost = item.old_values.cost.actual + item.old_values.cost.target + item.old_values.cost.remain;
        const newCost = item.new_values.cost.actual + item.new_values.cost.target + item.new_values.cost.remain;
        return total + (newCost - oldCost);
    }, 0);

    const analysis = {
        totalChanges: details.length,
        costChanges: costChanges.length,
        addedTasks: addedTasks.length,
        removedTasks: removedTasks.length,
        totalCostChange: totalCostChange
    };

    displayAnalysis(analysis);
}

function displayAnalysis(analysis) {
    const analysisContainer = document.getElementById('analysis-container');
    analysisContainer.innerHTML = `
        <h2>Comparison Analysis</h2>
        <p>Total Changes: ${analysis.totalChanges}</p>
        <p>Cost Changes: ${analysis.costChanges}</p>
        <p>Added Tasks: ${analysis.addedTasks}</p>
        <p>Removed Tasks: ${analysis.removedTasks}</p>
        <p>Total Cost Change: £${analysis.totalCostChange.toFixed(2)}</p>
    `;
}

function fetchProjects() {
    const uploadId1 = document.getElementById('upload-select-1').value;
    const uploadId2 = document.getElementById('upload-select-2').value;
    
    if (uploadId1 && uploadId2) {
        fetch(`/api/projects?xer_file_id=${uploadId1}`)
            .then(response => response.json())
            .then(projects => {
                const projectSelect = document.getElementById('project-select');
                projectSelect.innerHTML = '<option value="">Select a project</option>';
                projects.forEach(project => {
                    const option = document.createElement('option');
                    option.value = project.id;
                    option.textContent = project.name;
                    projectSelect.appendChild(option);
                });
            })
            .catch(error => console.error('Error fetching projects:', error));
    }
}

function displayComparisonSummary(summary) {
    const summaryElement = document.getElementById('comparison-summary');
    summaryElement.innerHTML = `
        <p>Total changes: ${summary.total_changes}</p>
        <p>Added tasks: ${summary.added_tasks}</p>
        <p>Removed tasks: ${summary.removed_tasks}</p>
        <p>Cost changes: ${summary.cost_changes}</p>
    `;
}

function displayComparisonResults(data) {
    const container = document.getElementById('comparison-container');
    container.innerHTML = '';
    
    if (data.length === 0) {
        container.innerHTML = '<p>No changes detected between the selected uploads.</p>';
        return;
    }
    
    data.forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'comparison-tile';
        
        let changeType = item.changes[0];
        let changeDetails = '';
        
        if (changeType === 'added') {
            tile.classList.add('change-added');
            changeDetails = `
                <p>New task added:</p>
                <p>Cost: £${item.new_values.cost.actual.toFixed(2)} (Actual) / £${item.new_values.cost.target.toFixed(2)} (Target) / £${item.new_values.cost.remain.toFixed(2)} (Remaining)</p>
            `;
        } else if (changeType === 'removed') {
            tile.classList.add('change-removed');
            changeDetails = `
                <p>Task removed:</p>
                <p>Cost: £${item.old_values.cost.actual.toFixed(2)} (Actual) / £${item.old_values.cost.target.toFixed(2)} (Target) / £${item.old_values.cost.remain.toFixed(2)} (Remaining)</p>
            `;
        } else if (changeType === 'cost') {
            changeType = 'Modified';
            tile.classList.add('change-modified');
            const actualDiff = item.new_values.cost.actual - item.old_values.cost.actual;
            const targetDiff = item.new_values.cost.target - item.old_values.cost.target;
            const remainDiff = item.new_values.cost.remain - item.old_values.cost.remain;
            changeDetails = `
                <p>Cost changes:</p>
                <p>Actual: £${item.old_values.cost.actual.toFixed(2)} → £${item.new_values.cost.actual.toFixed(2)} (${actualDiff >= 0 ? '+' : ''}£${actualDiff.toFixed(2)})</p>
                <p>Target: £${item.old_values.cost.target.toFixed(2)} → £${item.new_values.cost.target.toFixed(2)} (${targetDiff >= 0 ? '+' : ''}£${targetDiff.toFixed(2)})</p>
                <p>Remaining: £${item.old_values.cost.remain.toFixed(2)} → £${item.new_values.cost.remain.toFixed(2)} (${remainDiff >= 0 ? '+' : ''}£${remainDiff.toFixed(2)})</p>
            `;
        }
        
        tile.innerHTML = `
            <h3>${item.task_name}</h3>
            <p><strong>Task ID:</strong> ${item.task_id}</p>
            <p><strong>Project:</strong> ${item.project}</p>
            <p><strong>Change Type:</strong> ${changeType}</p>
            ${changeDetails}
        `;
        
        container.appendChild(tile);
    });
}

function applyFilters() {
    console.log('Applying filters');
    const taskFilter = document.getElementById('task-filter').value.toLowerCase();
    const changeTypeFilter = document.getElementById('change-type-filter').value;
    const costChangeFilter = document.getElementById('cost-change-filter').value;
    const comparisonMethod = document.querySelector('input[name="comparison-method"]:checked').value;

    if (!window.comparisonData) {
        console.log('No comparison data available');
        return [];
    }

    const filteredData = window.comparisonData.filter(item => {
        const taskMatch = comparisonMethod === 'id' ?
            item.task_id.toLowerCase().includes(taskFilter) :
            item.task_name.toLowerCase().includes(taskFilter);
        const changeTypeMatch = changeTypeFilter === '' || 
            (changeTypeFilter === 'added' && item.changes.includes('added')) ||
            (changeTypeFilter === 'removed' && item.changes.includes('removed')) ||
            (changeTypeFilter === 'modified' && !item.changes.includes('added') && !item.changes.includes('removed'));
        
        let costChangeMatch = true;
        if (costChangeFilter !== '' && item.changes.includes('cost')) {
            const oldTotal = item.old_values.cost.actual + item.old_values.cost.target + item.old_values.cost.remain;
            const newTotal = item.new_values.cost.actual + item.new_values.cost.target + item.new_values.cost.remain;
            const costDiff = newTotal - oldTotal;
            
            if (costChangeFilter === 'increased' && costDiff <= 0) costChangeMatch = false;
            if (costChangeFilter === 'decreased' && costDiff >= 0) costChangeMatch = false;
            if (costChangeFilter === 'no_change' && costDiff !== 0) costChangeMatch = false;
        }
        
        return taskMatch && changeTypeMatch && costChangeMatch;
    });

    console.log('Filtered data:', filteredData);
    displayComparisonResults(filteredData);
    return filteredData;
}

function exportToCSV() {
    console.log('Starting CSV export');
    try {
        const filteredData = applyFilters();
        console.log('Filtered data:', filteredData);
        
        if (!filteredData || filteredData.length === 0) {
            console.log('No data to export');
            alert('No data available for export. Please apply filters or load comparison data first.');
            return;
        }
        
        const comparisonMethod = document.querySelector('input[name="comparison-method"]:checked').value;
        const csvContent = convertToCSV(filteredData);
        console.log('CSV content created');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        console.log('Blob created');
        
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `comparison_data_${comparisonMethod}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            console.log('Link created and appended to body');
            link.click();
            document.body.removeChild(link);
            console.log('Link clicked and removed');
        } else {
            console.log('Browser does not support download attribute');
            alert('Your browser does not support the download feature. Please try a different browser.');
        }
    } catch (error) {
        console.error('Error in exportToCSV:', error);
        alert('An error occurred while exporting to CSV. Please try again.');
    }
}

function convertToCSV(data) {
    const headers = ['Task ID', 'Task Name', 'Project', 'Change Type', 'Old Actual Cost', 'New Actual Cost', 'Actual Cost Change', 'Old Target Cost', 'New Target Cost', 'Target Cost Change', 'Old Remaining Cost', 'New Remaining Cost', 'Remaining Cost Change'];
    const rows = data.map(item => {
        const changeType = item.changes[0] === 'cost' ? 'Modified' : item.changes[0].charAt(0).toUpperCase() + item.changes[0].slice(1);
        const oldActual = item.old_values?.cost?.actual || 0;
        const newActual = item.new_values?.cost?.actual || 0;
        const oldTarget = item.old_values?.cost?.target || 0;
        const newTarget = item.new_values?.cost?.target || 0;
        const oldRemain = item.old_values?.cost?.remain || 0;
        const newRemain = item.new_values?.cost?.remain || 0;
        return [
            item.task_id,
            item.task_name,
            item.project,
            changeType,
            oldActual,
            newActual,
            (newActual - oldActual).toFixed(2),
            oldTarget,
            newTarget,
            (newTarget - oldTarget).toFixed(2),
            oldRemain,
            newRemain,
            (newRemain - oldRemain).toFixed(2)
        ];
    });
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}