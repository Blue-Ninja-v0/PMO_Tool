document.addEventListener('DOMContentLoaded', initialize);

function initialize() {
    fetchUploads();
    setupEventListeners();
    Chart.register(ChartDragDataPlugin);
}

function renderCostForecastChart(data, period) {
    const ctx = document.getElementById('cost-forecast-chart').getContext('2d');
    const chart = Chart.getChart(ctx);
    if (chart) {
        chart.destroy();
    }

    let cumulativeActual = 0;
    let cumulativeTarget = 0;
    const cumulativeData = data.map(item => {
        cumulativeActual += item.actual_cost;
        cumulativeTarget += item.target_cost;
        return {
            period: item.period,
            actual_cost: item.actual_cost,
            target_cost: item.target_cost,
            cumulative_actual: cumulativeActual,
            cumulative_target: cumulativeTarget
        };
    });

    const chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: cumulativeData.map(item => item.period),
            datasets: [{
                label: 'Actual Cost',
                data: cumulativeData.map(item => item.actual_cost),
                borderColor: 'rgb(255, 99, 132)',
                tension: 0.1
            }, {
                label: 'Target Cost',
                data: cumulativeData.map(item => item.target_cost),
                borderColor: 'rgb(54, 162, 235)',
                tension: 0.1
            }, {
                label: 'Cumulative Actual Cost',
                data: cumulativeData.map(item => item.cumulative_actual),
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
            }, {
                label: 'Cumulative Target Cost',
                data: cumulativeData.map(item => item.cumulative_target),
                borderColor: 'rgb(153, 102, 255)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: `Cost Forecast (${period.charAt(0).toUpperCase() + period.slice(1)})`
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                dragData: {
                    round: 2,
                    showTooltip: true,
                    onDragStart: function(e, datasetIndex, index, value) {
                        return datasetIndex === 2; // Only allow dragging the Cumulative Actual Cost line
                    },
                    onDrag: function(e, datasetIndex, index, value) {
                        const yScale = chartInstance.scales.y;
                        const minValue = 0;
                        const maxValue = yScale.max;

                        // Limit the drag within the chart's y-axis range
                        value = Math.max(minValue, Math.min(value, maxValue));

                        const diff = value - cumulativeData[index].cumulative_actual;
                        const newActualCost = chartInstance.data.datasets[0].data[index] + diff;

                        // Ensure the actual cost doesn't go below 0
                        if (newActualCost >= 0) {
                            chartInstance.data.datasets[0].data[index] = newActualCost;
                            cumulativeData[index].cumulative_actual = value;

                            // Update cumulative values for subsequent points
                            for (let i = index + 1; i < cumulativeData.length; i++) {
                                cumulativeData[i].cumulative_actual += diff;
                                chartInstance.data.datasets[2].data[i] = cumulativeData[i].cumulative_actual;
                            }

                            chartInstance.update();
                        }
                    },
                    onDragEnd: function(e, datasetIndex, index, value) {
                        // You can add any additional logic here if needed after dragging ends
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '£' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });

    return chartInstance;
}

function exportForecast() {
    const uploadId = document.getElementById('upload-select').value;
    const projectId = document.getElementById('project-select').value;
    const activePeriodButton = document.querySelector('.time-button.active');
    
    if (!uploadId || !projectId || !activePeriodButton) {
        alert('Please select an upload, project, and time period before exporting.');
        return;
    }
    
    const period = activePeriodButton.dataset.period;
    const url = `/api/cost_dashboard/export_forecast?xer_file_id=${uploadId}&proj_id=${projectId}&time_period=${period}`;
    
    fetch(url)
        .then(response => response.text())
        .then(csvData => {
            const rows = csvData.split('\n').map(row => row.split(','));
            
            const cumulativeActual = [0];
            const cumulativeTarget = [0];
            for (let i = 1; i < rows[1].length; i++) {
                cumulativeActual[i] = cumulativeActual[i-1] + parseFloat(rows[1][i] || 0);
                cumulativeTarget[i] = cumulativeTarget[i-1] + parseFloat(rows[2][i] || 0);
            }
            
            rows.push(['Cumulative Actual', ...cumulativeActual]);
            rows.push(['Cumulative Target', ...cumulativeTarget]);
            
            const updatedCsvData = rows.map(row => row.join(',')).join('\n');
            
            const blob = new Blob([updatedCsvData], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', `cost_forecast_${period}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        })
        .catch(error => {
            console.error('Error exporting forecast:', error);
            alert('An error occurred while exporting the forecast. Please try again.');
        });
}

function resetDashboard() {
    // Clear existing charts
    ['overall-costs-chart', 'task-costs-chart', 'resource-breakdown-chart', 'cost-trends-chart'].forEach(id => {
        const chart = Chart.getChart(id);
        if (chart) {
            chart.destroy();
        }
    });

    // Clear totals display
    document.getElementById('overall-costs-totals').innerHTML = '';

    // Reset project select
    const projectSelect = document.getElementById('project-select');
    projectSelect.innerHTML = '<option value="">Select a project</option>';

    // Clear task search input
    document.getElementById('task-search-input').value = '';
}

function filterTasks() {
    const searchTerm = document.getElementById('task-search-input').value.toLowerCase();
    let filteredData;
    if (searchTerm) {
        filteredData = window.allTaskData.filter(item => item.task_name.toLowerCase().includes(searchTerm));
    } else {
        filteredData = window.allTaskData.slice(0, 10);
    }

    updateTaskMetrics(filteredData);
    window.taskCostsChart.data.labels = filteredData.map(item => item.task_name);
    window.taskCostsChart.data.datasets[0].data = filteredData.map(item => item.actual_cost);
    window.taskCostsChart.data.datasets[1].data = filteredData.map(item => item.target_cost);
    window.taskCostsChart.data.datasets[2].data = filteredData.map(item => item.remain_cost);
    window.taskCostsChart.options.plugins.title.text = searchTerm ? 'Filtered Task Costs' : 'Top 10 Task Costs';
    window.taskCostsChart.update();
}

function updateTimePeriod(event, period) {
    document.querySelectorAll('.time-button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    const uploadId = document.getElementById('upload-select').value;
    const projectId = document.getElementById('project-select').value;
    
    if (!uploadId || !projectId) {
        alert('Please select both an upload and a project before updating the time period.');
        return;
    }
    
    fetch(`/api/cost_dashboard/forecast?xer_file_id=${uploadId}&proj_id=${projectId}&time_period=${period}`)
        .then(response => response.json())
        .then(data => {
            window.costForecastChart = renderCostForecastChart(data, period);
        })
        .catch(error => {
            console.error('Error fetching cost forecast data:', error);
            alert('An error occurred while fetching the cost forecast data. Please try again.');
        });
}

function fetchUploads() {
    fetch('/api/uploads')
        .then(response => response.json())
        .then(populateUploadSelect)
        .catch(error => console.error('Error fetching uploads:', error));
}

function populateUploadSelect(uploads) {
    const uploadSelect = document.getElementById('upload-select');
    uploads.forEach(upload => {
        const option = document.createElement('option');
        option.value = upload;
        option.textContent = `Upload ${upload}`;
        uploadSelect.appendChild(option);
    });
}

function setupEventListeners() {
    document.getElementById('upload-select').addEventListener('change', event => {
        document.getElementById('project-select').innerHTML = '<option value="">Select a project</option>';
        fetchProjects(event);
    });
    document.getElementById('load-data').addEventListener('click', loadDashboardData);
    document.getElementById('task-search-input').addEventListener('input', filterTasks);
    document.querySelectorAll('.time-button').forEach(button => {
        button.addEventListener('click', (event) => updateTimePeriod(event, button.dataset.period));
    });
    document.getElementById('export-forecast').addEventListener('click', exportForecast);
}

function fetchProjects(event) {
    const uploadId = event.target.value;
    resetDashboard();
    if (uploadId) {
        fetch(`/api/projects?xer_file_id=${uploadId}`)
            .then(response => response.json())
            .then(populateProjectSelect)
            .catch(error => {
                console.error('Error fetching projects:', error);
                alert('An error occurred while fetching projects. Please try again.');
            });
    }
}

function populateProjectSelect(projects) {
    const projectSelect = document.getElementById('project-select');
    projectSelect.innerHTML = '';
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        projectSelect.appendChild(option);
    });
}

function loadDashboardData() {
    const uploadId = document.getElementById('upload-select').value;
    const projectId = document.getElementById('project-select').value;
    
    if (!uploadId || !projectId) {
        alert('Please select both an upload and a project before loading data.');
        return;
    }
    
    Promise.all([
        fetch(`/api/cost_dashboard/overall?xer_file_id=${uploadId}&proj_id=${projectId}`).then(res => res.json()),
        fetch(`/api/cost_dashboard/tasks?xer_file_id=${uploadId}&proj_id=${projectId}`).then(res => res.json()),
        fetch(`/api/cost_dashboard/resources?xer_file_id=${uploadId}&proj_id=${projectId}`).then(res => res.json()),
        fetch(`/api/cost_dashboard/forecast?xer_file_id=${uploadId}&proj_id=${projectId}&time_period=monthly`).then(res => res.json())
    ])
    .then(([overallCosts, taskCosts, resourceCosts, forecastData]) => {
        renderOverallCostsChart(overallCosts);
        renderTaskCostsChart(taskCosts);
        renderResourceBreakdownChart(resourceCosts);
        renderCostForecastChart(forecastData, 'monthly');
    })
    .catch(error => {
        console.error('Error loading dashboard data:', error);
        alert('An error occurred while loading the dashboard data. Please try again.');
    });
}

function renderOverallCostsChart(data) {
    const ctx = document.getElementById('overall-costs-chart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Actual Cost', 'Target Cost', 'Remaining Cost'],
            datasets: [{
                label: 'Cost',
                data: [data.total_actual_cost, data.total_target_cost, data.total_remain_cost],
                backgroundColor: ['rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)', 'rgba(255, 206, 86, 0.2)'],
                borderColor: ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 206, 86, 1)'],
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '£' + value.toLocaleString();
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return '£' + context.parsed.y.toLocaleString();
                        }
                    }
                }
            }
        }
    });

    // Display totals
    const totalsDiv = document.getElementById('overall-costs-totals');
    totalsDiv.innerHTML = `
        <p>Total Actual Cost: £${data.total_actual_cost.toLocaleString()}</p>
        <p>Total Target Cost: £${data.total_target_cost.toLocaleString()}</p>
        <p>Total Remaining Cost: £${data.total_remain_cost.toLocaleString()}</p>
    `;
}

function renderTaskCostsChart(data) {
    window.allTaskData = data;
    const top10Data = data.slice(0, 10);
    updateTaskMetrics(top10Data);
    const ctx = document.getElementById('task-costs-chart').getContext('2d');
    window.taskCostsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10Data.map(task => task.task_name),
            datasets: [{
                label: 'Actual Cost',
                data: top10Data.map(task => task.actual_cost),
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            }, {
                label: 'Target Cost',
                data: top10Data.map(task => task.target_cost),
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }, {
                label: 'Remaining Cost',
                data: top10Data.map(task => task.remain_cost),
                backgroundColor: 'rgba(255, 206, 86, 0.2)',
                borderColor: 'rgba(255, 206, 86, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    stacked: true,
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '£' + value.toLocaleString();
                        }
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Top 10 Task Costs'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': £' + context.parsed.y.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function renderResourceBreakdownChart(data) {
    const ctx = document.getElementById('resource-breakdown-chart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(resource => resource.rsrc_name),
            datasets: [{
                data: data.map(resource => resource.actual_cost),
                backgroundColor: [
                    'rgba(255, 179, 186, 0.8)',
                    'rgba(255, 223, 186, 0.8)',
                    'rgba(255, 255, 186, 0.8)',
                    'rgba(186, 255, 201, 0.8)',
                    'rgba(186, 225, 255, 0.8)',
                    'rgba(223, 186, 255, 0.8)',
                    'rgba(255, 186, 255, 0.8)',
                    'rgba(255, 186, 223, 0.8)',
                    'rgba(186, 255, 255, 0.8)',
                    'rgba(210, 218, 226, 0.8)'
                ],
                borderColor: 'rgba(255, 255, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                },
                title: {
                    display: true,
                    text: 'Resource Cost Breakdown'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += '£' + context.parsed.toLocaleString();
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function updateTaskMetrics(data) {
    const totalActual = data.reduce((sum, task) => sum + task.actual_cost, 0);
    const totalTarget = data.reduce((sum, task) => sum + task.target_cost, 0);
    const totalRemaining = data.reduce((sum, task) => sum + task.remain_cost, 0);

    document.getElementById('task-total-actual').textContent = '£' + totalActual.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('task-total-target').textContent = '£' + totalTarget.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    document.getElementById('task-total-remaining').textContent = '£' + totalRemaining.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}



function updateCumulativeValues(data) {
    const cumulativeValuesElement = document.getElementById('cumulative-values');
    if (!cumulativeValuesElement) {
        const trendsSection = document.getElementById('trends-section');
        const newElement = document.createElement('div');
        newElement.id = 'cumulative-values';
        newElement.className = 'cumulative-values';
        trendsSection.appendChild(newElement);
    }
    
    document.getElementById('cumulative-values').innerHTML = `
        <p>Period: ${data.period}</p>
        <p>Cumulative Actual Cost: £${data.cumulative_actual.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
        <p>Cumulative Target Cost: £${data.cumulative_target.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
    `;
}
