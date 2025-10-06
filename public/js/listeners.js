import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const inclusionColor = "lightblue"; // Original color from drawer_d3.js (treecolor)

export function mouseEntersNodeCell() {
  const nodeCell = d3.select(this);
  const data = nodeCell.datum();

  // Identify all elements
  const allNodeCells = d3.selectAll("g.node-cell");
  const allEdges = d3.select(".linear-edges").selectAll("path.edge");
  const allInclusions = d3.select(".cluster-inclusions").selectAll("path.inclusion");
  const allAdjCells = d3.selectAll(".adjacency g.adjacency-cell");

  // Identify all relevant parts
  const leaves = data.getLeaves();
  const leafIDs = new Set(leaves.map((n) => n.getID()));
  const descendants = [data, ...data.getDescendants()];
  const allRelevantNodes = new Set(descendants);

  // Set of ALL leaf IDs connected to the cluster (internal + external)
  const connectedLeafIDs = new Set();
  allEdges.each(d => {
      const sourceID = d.getSource().getID();
      const targetID = d.getTarget().getID();
      
      if (leafIDs.has(sourceID)) {
          connectedLeafIDs.add(targetID);
      }
      if (leafIDs.has(targetID)) {
          connectedLeafIDs.add(sourceID);
      }
  });

  // Step 1: Fade ALL non-relevant elements

  // a) Fade all *cluster nodes* (but preserve linear nodes and the hovered cluster's internal nodes)
  allNodeCells
    .filter(d => d.getNodeType() !== 0) // Target only cluster nodes 
    .filter(d => !allRelevantNodes.has(d)) // Exclude the hovered cluster and its descendants
    .attr("opacity", 0.3)
    .selectAll("use")
    .attr("fill", "gray");
    
  // b) Fade all edges
  allEdges
    .attr("opacity", 0.1)
    .attr("stroke", "lightgray");
    
  // c) Fade all inclusion bands
  allInclusions
    .attr("opacity", 0.1)
    .attr("fill", "lightgray");

  // d) Identify and fade ONLY adjacency cells NOT in the relevant cluster
  allAdjCells
    .filter((d) => !allRelevantNodes.has(d.source.getParent())) 
    .attr("opacity", 0.1)
    .each(function (d) {
        d3.select(this).select("use").attr("fill", "lightgray");
    });


  // Step 2: Highlight the hovered node and its linear layout cells (INTERNAL NODES)
  nodeCell
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "black"); 

  d3.select(".linear-nodes")
    .selectAll("g.node-cell")
    .filter((d) => leafIDs.has(d.getID()))
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "black"); 

  // Step 3: Highlight the OTHER ENDPOINTS in the linear layout (EXTERNAL NODES)
  // They are highlighted by achieving full opacity and retaining their default black color
  d3.select(".linear-nodes")
    .selectAll("g.node-cell")
    .filter((d) => connectedLeafIDs.has(d.getID()) && !leafIDs.has(d.getID())) // Is connected AND is external
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "black"); // <--- FIX: Using default black color

  // Step 4: Highlight all relevant edges (incident to a leaf node in the cluster)
  allEdges
    .filter((d) => leafIDs.has(d.getSource().getID()) || leafIDs.has(d.getTarget().getID()))
    .attr("opacity", 1)
    .attr("stroke", "rgb(50, 125, 200)");

  // Step 5: Highlight all relevant inclusion bands
  allInclusions
    .filter((d) => allRelevantNodes.has(d.node))
    .attr("opacity", 1)
    .attr("fill", inclusionColor);
    
  // Step 6: Highlight the cluster's adjacency cells (internal connections)
  allAdjCells
    .filter((d) => allRelevantNodes.has(d.source.getParent())) 
    .attr("opacity", 1)
    .each(function (d) {
        const cellColor = d && d.color ? d.color : "lightgray";
        d3.select(this).select("use").attr("fill", cellColor); 
    });

  // Step 7: HIGHLIGHT ROWS/COLUMNS OF MATRICES
  allAdjCells
    .filter(d => 
        (d.source.getParent() === data.getParent() && allRelevantNodes.has(d.source)) || 
        (d.target.getParent() === data.getParent() && allRelevantNodes.has(d.target)) ||
        (allRelevantNodes.has(d.source) && allRelevantNodes.has(d.target.getParent())) ||
        (allRelevantNodes.has(d.target) && allRelevantNodes.has(d.source.getParent()))
    )
    .attr("opacity", 1)
    .each(function (d) {
        const cellColor = d && d.color ? d.color : "lightgray";
        d3.select(this).select("use").attr("fill", cellColor);
    });

}

export function mouseLeavesNodeCell() {
  // This function must also be updated to restore the external node colors.
  
  // 1. Restore all node cells
  d3.selectAll("g.node-cell")
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "black"); // Restore to default node color

  // 2. Restore all adjacency cells
  d3.selectAll(".adjacency g.adjacency-cell")
    .attr("opacity", 1)
    .each(function (d) {
      const cellColor = d && d.color ? d.color : "lightgray";
      d3.select(this).select("use").attr("fill", cellColor);
    });

  // 3. Restore all linear edges
  d3.select(".linear-edges")
    .selectAll("path.edge")
    .attr("opacity", 1)
    .attr("stroke", "rgb(50, 125, 200)");
    
  // 4. Restore all inclusion bands
  d3.select(".cluster-inclusions")
    .selectAll("path.inclusion")
    .attr("opacity", 1)
    .attr("fill", inclusionColor);
}

export function mouseEntersAdjCell() {
  const data = d3.select(this).datum();

  // 1. Identify relevant clusters/nodes for all highlights
  const sourceLeaves = new Set(data.source.getLeaves().map((n) => n.getID()));
  const targetLeaves = new Set(data.target.getLeaves().map((n) => n.getID()));
  
  const sourceAndDescendants = [data.source, ...data.source.getDescendants()];
  const targetAndDescendants = [data.target, ...data.target.getDescendants()];
  const allRelevantNodes = new Set([ // Source, Target, and all their descendants
    ...sourceAndDescendants,
    ...targetAndDescendants,
  ]);
  
  // Get IDs of source/target and the parent cluster for local matrix comparison
  const dataSourceID = data.source.getID();
  const dataTargetID = data.target.getID();
  const parentCluster = data.source.getParent(); 
  
  // Select ALL elements
  const allAdjCells = d3.selectAll(".adjacency g.adjacency-cell");
  const allEdges = d3.select(".linear-edges").selectAll("path.edge");
  const allInclusions = d3.select(".cluster-inclusions").selectAll("path.inclusion");
  const allNodes = d3.selectAll("g.node-cell"); // All nodes (cluster and leaf)

  // Step 1. FADE EVERYTHING (Initial global fade)
  
  // a) Gray out ALL ADJACENCY CELLS 
  allAdjCells
    .attr("opacity", 0.2)
    .each(function (d) {
      const cellColor = d && d.color ? d.color : "lightgray";
      d3.select(this).select("use").attr("fill", cellColor);
    });
    
  // b) Gray out all inclusion bands
  allInclusions
    .attr("fill", inclusionColor) 
    .attr("opacity", 0.2); 

  // c) Gray out all edges
  allEdges
    .attr("stroke", "lightgray")
    .attr("stroke-width", "2")
    .attr("opacity", 0.4);

  // d) Gray out all nodes (cluster and leaf)
  allNodes
    .attr("opacity", 0.3)
    .selectAll("use")
    .attr("fill", "gray");


  // Step 2. HIGHLIGHTING (Restore opacity/color for relevant elements)

  // a) Highlight all cells belonging to the included (descendant) matrices
  allAdjCells
    .filter(d => allRelevantNodes.has(d.source.getParent()))
    .attr("opacity", 1)
    .each(function (d) {
        d3.select(this).select("use").attr("fill", d.color);
    });

  // b) Highlight ONLY the row and column cells within the hovered matrix (Local Matrix)
  allAdjCells
    .filter(
      (d) =>
        d.source.getParent() === parentCluster && 
        d.target.getParent() === parentCluster &&
        (d.source.getID() === dataSourceID || d.target.getID() === dataTargetID || 
         d.source.getID() === dataTargetID || d.target.getID() === dataSourceID)
    )
    .attr("opacity", 1)
    .each(function (d) {
      d3.select(this).select("use").attr("fill", d.color);
    });

  // c) Highlight the hovered cell itself (ensuring full color/opacity)
  d3.select(this)
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", d => d.color);


  // d) Highlight the included clusters (Inclusion Bands)
  allInclusions
    .filter((d) => allRelevantNodes.has(d.node)) 
    .attr("opacity", 1);


  // e) Highlight included vertices (Linear Layout Nodes - the leaves)
  allNodes
    .filter((d) => sourceLeaves.has(d.getID()) || targetLeaves.has(d.getID()))
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "black"); 
    
  // f) Highlight the source and target nodes defining the hovered cell (hierarchy view) <--- FIX
  allNodes
    .filter((d) => d === data.source || d === data.target)
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "black");


  // g) Highlight only the relevant edges
  allEdges
    .filter((d) => {
      const dSourceID = d.getSource().getID();
      const dTargetID = d.getTarget().getID();
      return (
        (sourceLeaves.has(dSourceID) && targetLeaves.has(dTargetID)) ||
        (sourceLeaves.has(dTargetID) && targetLeaves.has(dSourceID))
      );
    })
    .attr("stroke", "rgb(50, 125, 200)")
    .attr("stroke-width", "6")
    .attr("opacity", 1);
}

export function mouseLeavesAdjCell() {
  // 1. Restore all adjacency cells
  d3.selectAll(".adjacency g.adjacency-cell")
    .attr("opacity", 1)
    .each(function (d) {
      const cellColor = d && d.color ? d.color : "lightgray";
      d3.select(this).select("use").attr("fill", cellColor);
    });

  // 2. Restore ALL nodes (cluster and leaf) <--- NEW LOGIC ADDED HERE
  d3.selectAll("g.node-cell")
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "black"); // Restore to default node color

  // 3. Restore all linear edges
  d3.select(".linear-edges")
    .selectAll("path.edge")
    .attr("opacity", 1)
    .attr("stroke", "rgb(50, 125, 200)")
    .attr("stroke-width", "4");
    
  // 4. Restore all inclusion bands
  d3.select(".cluster-inclusions")
    .selectAll("path.inclusion")
    .attr("opacity", 1)
    .attr("fill", inclusionColor);
}

export function mouseEntersEdge() {
    const data = d3.select(this).datum();
    const sourceNode = data.getSource();
    const targetNode = data.getTarget();

    // 1. Define selections
    const allAdjCells = d3.selectAll(".adjacency g.adjacency-cell");
    const allEdges = d3.select(".linear-edges").selectAll("path.edge");
    const allInclusions = d3.select(".cluster-inclusions").selectAll("path.inclusion");
    const allNodes = d3.selectAll("g.node-cell"); // All nodes (cluster and leaf)

    // 2. FADE EVERYTHING
    allAdjCells.attr("opacity", 0.2);
    allInclusions.attr("opacity", 0.2).attr("fill", inclusionColor);
    allEdges.attr("opacity", 0.1).attr("stroke", "lightgray").attr("stroke-width", "2");
    allNodes.attr("opacity", 0.3).selectAll("use").attr("fill", "gray"); 

    // 3. IDENTIFY ANCESTORS
    const ancestorNodes = new Set();
    let currentSource = sourceNode;
    let currentTarget = targetNode;

    // Trace ancestors up the tree. This set includes the immediate parent clusters.
    while (currentSource) {
        ancestorNodes.add(currentSource);
        currentSource = currentSource.getParent();
    }
    while (currentTarget) {
        ancestorNodes.add(currentTarget);
        currentTarget = currentTarget.getParent();
    }
    
    // 4. HIGHLIGHT RELEVANT ELEMENTS

    // a) Highlight the hovered edge
    d3.select(this)
        .attr("opacity", 1)
        .attr("stroke", "rgb(50, 125, 200)")
        .attr("stroke-width", "6");

    // b) Highlight the endpoint leaf nodes (linear layout/hierarchy view)
    allNodes
        .filter(d => d === sourceNode || d === targetNode)
        .attr("opacity", 1)
        .selectAll("use")
        .attr("fill", "black");

    // c) Highlight the ancestor inclusion bands (i.e., C1-P1, P1-G1, etc.)
    allInclusions
        .filter(d => ancestorNodes.has(d.node))
        .attr("opacity", 1)
        .attr("fill", inclusionColor);
        
    // d) Highlight the ancestor matrices (adjacency cells)
    allAdjCells
        .filter(d => ancestorNodes.has(d.source.getParent()))
        .attr("opacity", 1)
        .each(function (d) {
            d3.select(this).select("use").attr("fill", d.color);
        });
        
    // e) Highlight ALL cluster nodes (headers) along the ancestry path (FIX: This restores C1 and C2)
    allNodes
        .filter(d => ancestorNodes.has(d) || ancestorNodes.has(d.getParent()))
        .attr("opacity", 1)
        .selectAll("use")
        .attr("fill", "black");
}

export function mouseLeavesEdge() {
    // 1. Restore all adjacency cells
    d3.selectAll(".adjacency g.adjacency-cell")
        .attr("opacity", 1)
        .each(function (d) {
            const cellColor = d && d.color ? d.color : "lightgray";
            d3.select(this).select("use").attr("fill", cellColor);
        });

    // 2. Restore ALL nodes (cluster and leaf)
    d3.selectAll("g.node-cell")
        .attr("opacity", 1)
        .selectAll("use")
        .attr("fill", "black");

    // 3. Restore all linear edges
    d3.select(".linear-edges")
        .selectAll("path.edge")
        .attr("opacity", 1)
        .attr("stroke", "rgb(50, 125, 200)")
        .attr("stroke-width", "4");

    // 4. Restore all inclusion bands
    d3.select(".cluster-inclusions")
        .selectAll("path.inclusion")
        .attr("opacity", 1)
        .attr("fill", inclusionColor);
}