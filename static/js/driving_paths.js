let keyStartNode, keyEndNode;

document.addEventListener('DOMContentLoaded', initialize);

function initialize() {
    fetchUploads();
    setupEventListeners();
    adjustGraphSize();
    window.addEventListener('resize', adjustGraphSize);
    setupControlButtons();
}

function setupControlButtons() {
    document.getElementById('zoom-in').addEventListener('click', () => window.zoomIn());
    document.getElementById('zoom-out').addEventListener('click', () => window.zoomOut());
    document.getElementById('pan-left').addEventListener('click', () => window.panLeft());
    document.getElementById('pan-right').addEventListener('click', () => window.panRight());
    document.getElementById('pan-up').addEventListener('click', () => window.panUp());
    document.getElementById('pan-down').addEventListener('click', () => window.panDown());
    document.getElementById('reset-view').addEventListener('click', () => window.resetView());
    document.getElementById('export-svg').addEventListener('click', exportSVG);
    document.getElementById('share-graph').addEventListener('click', shareGraph);
}

function adjustGraphSize() {
    const graph = document.getElementById('graph');
    graph.setAttribute('width', graph.clientWidth);
    graph.setAttribute('height', graph.clientHeight);
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
    document.getElementById('upload-select').addEventListener('change', fetchProjects);
    document.getElementById('load-graph').addEventListener('click', loadGraphFromInputs);
    document.getElementById('layout-toggle').addEventListener('change', loadGraphFromInputs);
    document.getElementById('node-count').addEventListener('change', function() {
        const value = parseInt(this.value);
        if (value < 25) this.value = 25;
        if (value > 1000) this.value = 1000;
    });
    document.getElementById('keyword-filter').addEventListener('input', applyKeywordHighlight);
}

function fetchProjects(event) {
    const uploadId = event.target.value;
    fetch(`/api/projects?xer_file_id=${uploadId}`)
        .then(response => response.json())
        .then(populateProjectSelect)
        .catch(error => console.error('Error fetching projects:', error));
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

function loadGraphFromInputs() {
    const uploadId = document.getElementById('upload-select').value;
    const projectId = document.getElementById('project-select').value;
    const layoutType = document.getElementById('layout-toggle').value;
    const nodeCount = document.getElementById('node-count').value;
    loadGraph(uploadId, projectId, layoutType, nodeCount);
}

function loadGraph(uploadId, projectId, layoutType, nodeCount) {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('graph-info').innerHTML = '';

    fetch(`/api/graph?xer_file_id=${uploadId}&proj_id=${projectId}&layout=${layoutType}&node_count=${nodeCount}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('loading').style.display = 'none';
            updateGraphInfo(data);
            renderGraph(data);
            applyKeywordHighlight();
        })
        .catch(handleGraphError);
}

function updateGraphInfo(data) {
    const graphInfo = `Layout: ${data.layout_type} | Nodes: ${data.nodes.length} | Links: ${data.links.length}`;
    document.getElementById('graph-info').innerHTML = graphInfo;
}

function handleGraphError(error) {
    console.error('Error loading graph:', error);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('graph-info').innerHTML = 'Error loading graph. Please try again.';
}

function renderGraph(data) {
    const svg = d3.select("#graph");
    svg.selectAll("*").remove();

    const width = +svg.attr("width");
    const height = +svg.attr("height");

    keyStartNode = data.key_start_node;
    keyEndNode = data.key_end_node;

    const simulation = createSimulation(data, width, height);
    const link = createLinks(svg, data.links);
    const node = createNodes(svg, data.nodes);

    setupNodeInteractions(node, simulation);
    setupSimulationTick(simulation, link, node);
    setupZoom(svg);

    applyKeywordHighlight();

    svg.on('click', (event) => {
        if (event.target.tagName !== 'circle') {
            hideTaskDetails();
        }
    });
}


function applyKeywordHighlight() {
    const keyword = document.getElementById('keyword-filter').value.toLowerCase();
    if (!keyword) {
        d3.selectAll("line").attr("stroke", "#9CAEBC").attr("stroke-width", d => Math.sqrt(d.value));
        return;
    }

    d3.selectAll("line")
        .attr("stroke", d => {
            const sourceMatch = d.source.name.toLowerCase().includes(keyword);
            const targetMatch = d.target.name.toLowerCase().includes(keyword);
            return (sourceMatch || targetMatch) ? "#FF6B6B" : "#9CAEBC";
        })
        .attr("stroke-width", d => {
            const sourceMatch = d.source.name.toLowerCase().includes(keyword);
            const targetMatch = d.target.name.toLowerCase().includes(keyword);
            return (sourceMatch || targetMatch) ? 3 : Math.sqrt(d.value);
        });
}

function createSimulation(data, width, height) {
    return d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.links).id(d => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-500))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX(d => getNodeXPosition(d, width)).strength(0.1))
        .force("y", d3.forceY(height / 2).strength(0.1))
        .force("collision", d3.forceCollide().radius(30));
}

function getNodeXPosition(d, width) {
    if (d.id === keyStartNode) return width * 0.25;
    if (d.id === keyEndNode) return width * 0.75;
    return width / 2;
}

function createLinks(svg, links) {
    return svg.append("g")
        .attr("stroke", "#9CAEBC")
        .attr("stroke-opacity", 0.6)
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke-width", d => Math.sqrt(d.value));
}

function createNodes(svg, nodes) {
    return svg.append("g")
        .attr("stroke", "#FFFFFF")
        .attr("stroke-width", 1.5)
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", d => getNodeRadius(d))
        .attr("fill", d => getNodeColor(d));
}

function getNodeRadius(d) {
    if (d.id === keyStartNode || d.id === keyEndNode) return 15;
    return d.driving_path === 'Y' ? 10 : 7;
}

function getNodeColor(d) {
    if (d.id === keyStartNode) return "#0EA76D";
    if (d.id === keyEndNode) return "#FFB142";
    return d.driving_path === 'Y' ? "#E0134A" : "#3686B4";
}

function setupNodeInteractions(node, simulation) {
    const tooltip = d3.select("body").append("div")
        .attr("class", "node-tooltip");

    node.call(drag(simulation))
        .on('mouseover', (event, d) => showTooltip(event, d, tooltip))
        .on('mouseout', () => hideTooltip(tooltip))
        .on('click', (event, d) => showTaskDetails(d));
}

function showTooltip(event, d, tooltip) {
    tooltip.transition()
        .duration(1000)
        .style("opacity", .9);
    let nodeType = d.id === keyStartNode ? "Key Start Node<br/>" :
                   d.id === keyEndNode ? "Key End Node<br/>" : "";
    tooltip.html(`${nodeType}${d.hover_info}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
}

function hideTooltip(tooltip) {
    tooltip.transition()
        .duration(500)
        .style("opacity", 0);
}

function showTaskDetails(d) {
    const detailsBox = document.getElementById('task-details');
    const detailsContent = document.getElementById('task-details-content');
    const predecessorsList = document.getElementById('predecessors-list');
    const successorsList = document.getElementById('successors-list');
    
    detailsContent.innerHTML = `
        <p><strong>Task ID:</strong> ${d.id}</p>
        <p><strong>Task Name:</strong> ${d.name}</p>
        <p><strong>Project:</strong> ${d.project}</p>
        <p><strong>Start Date:</strong> ${d.start}</p>
        <p><strong>End Date:</strong> ${d.end}</p>
        <p><strong>Float:</strong> ${d.float}</p>
        <p><strong>Remaining Duration:</strong> ${d.remaining_duration}</p>
        <p><strong>On Driving Path:</strong> ${d.driving_path === 'Y' ? 'Yes' : 'No'}</p>
        <p><strong>Actual Cost:</strong> $${d.actual_cost.toFixed(2)}</p>
        <p><strong>Target Cost:</strong> $${d.target_cost.toFixed(2)}</p>
        <p><strong>Remaining Cost:</strong> $${d.remain_cost.toFixed(2)}</p>
    `;
    
    predecessorsList.innerHTML = '';
    successorsList.innerHTML = '';

    d3.selectAll('line').each(function(link) {
        if (link.target.id === d.id) {
            const li = document.createElement('li');
            li.textContent = link.source.name;
            predecessorsList.appendChild(li);
        } else if (link.source.id === d.id) {
            const li = document.createElement('li');
            li.textContent = link.target.name;
            successorsList.appendChild(li);
        }
    });
    
    detailsBox.classList.remove('hidden');
}

function hideTaskDetails() {
    const detailsBox = document.getElementById('task-details');
    detailsBox.classList.add('hidden');
}

document.getElementById('close-task-details').addEventListener('click', hideTaskDetails);

function setupSimulationTick(simulation, link, node) {
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
    });
}

function setupZoom(svg) {
    const zoom = d3.zoom()
        .scaleExtent([0.1, 10])
        .on("zoom", zoomed);

    svg.call(zoom);

    function zoomed(event) {
        svg.selectAll("g").attr("transform", event.transform);
    }

    // Zoom and pan control functions
    window.zoomIn = () => svg.transition().call(zoom.scaleBy, 1.2);
    window.zoomOut = () => svg.transition().call(zoom.scaleBy, 0.8);
    window.panLeft = () => svg.transition().call(zoom.translateBy, 50, 0);
    window.panRight = () => svg.transition().call(zoom.translateBy, -50, 0);
    window.panUp = () => svg.transition().call(zoom.translateBy, 0, 50);
    window.panDown = () => svg.transition().call(zoom.translateBy, 0, -50);
    window.resetView = () => svg.transition().call(zoom.transform, d3.zoomIdentity);
}

function drag(simulation) {
    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }
    
    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }
    
    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }
    
    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
}

function exportSVG() {
    const svgData = document.getElementById('graph').outerHTML;
    const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = 'graph.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

function shareGraph() {
    const currentUrl = window.location.href;
    const uploadId = document.getElementById('upload-select').value;
    const projectId = document.getElementById('project-select').value;
    const layoutType = document.getElementById('layout-toggle').value;
    const nodeCount = document.getElementById('node-count').value;
    
    const shareableUrl = `${currentUrl}?uploadId=${uploadId}&projectId=${projectId}&layout=${layoutType}&nodeCount=${nodeCount}`;
    
    navigator.clipboard.writeText(shareableUrl).then(() => {
        alert('Shareable link copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy shareable link. Please try again.');
    });
}