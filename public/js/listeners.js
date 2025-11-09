import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const inclusionColor = "var(--tree-color)"; // Original color from drawer_d3.js (treecolor)

export function mouseEntersNodeCell() {
  const nodeCell = d3.select(this);
  const data = nodeCell.datum();

  // Identify all elements
  const allNodeCells = d3.selectAll("g.node-cell");
  const allEdges = d3.select(".linear-edges").selectAll("path.edge");
  const allInclusions = d3
    .select(".cluster-inclusions")
    .selectAll("path.inclusion");
  const allAdjCells = d3.selectAll(".adjacency g.adjacency-cell");

  // Identify all relevant parts
  const leaves = data.getLeaves();
  const leafIDs = new Set(leaves.map((n) => n.getID()));
  const descendants = [data, ...data.getDescendants()];
  const allRelevantNodes = new Set(descendants);

  // --- START MODIFICATION: IDENTIFY ANCESTORS ---
  // Create a set for all ancestors (parents, grandparents, etc.)
  const ancestorNodes = new Set();
  let currentParent = data.getParent();
  while (currentParent) {
    ancestorNodes.add(currentParent);
    currentParent = currentParent.getParent();
  }

  // Merge ancestor nodes into the set of nodes to be highlighted
  ancestorNodes.forEach((node) => allRelevantNodes.add(node));
  // --- END MODIFICATION ---

  // Set of ALL leaf IDs connected to the cluster (internal + external)
  const connectedLeafIDs = new Set();
  allEdges.each((d) => {
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
    .filter((d) => d.getNodeType() !== 0) // Target only cluster nodes
    .filter((d) => !allRelevantNodes.has(d)) // Exclude the hovered cluster, its descendants, AND its ancestors
    .attr("opacity", 0.3)
    .selectAll("use")
    .attr("fill", "gray");

  // b) Fade all edges
  allEdges.attr("opacity", 0.1).attr("stroke", "lightgray");

  // c) Fade all inclusion bands
  allInclusions.attr("opacity", 0.1).attr("fill", "lightgray");

  // d) Identify and fade ONLY adjacency cells NOT in a relevant cluster (hovered cluster or any ancestor)
  // We check against the parent of the adjacency cell's source node.
  allAdjCells
    .filter((d) => !allRelevantNodes.has(d.source.getParent()))
    .attr("opacity", 0.1)
    .each(function (d) {
      d3.select(this).select("use").attr("fill", "lightgray");
    });

  // Step 2: Highlight the hovered node, its descendants, and its ancestors (headers and leaves)
  allNodeCells
    .filter((d) => allRelevantNodes.has(d)) // Include the hovered node, its descendants, AND its ancestors
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "var(--node-color)");

  // Step 3: Highlight the OTHER ENDPOINTS in the linear layout (EXTERNAL NODES)
  // These are the leaves connected by an edge but not part of the hovered cluster's leaves
  d3.select(".linear-nodes")
    .selectAll("g.node-cell")
    .filter((d) => connectedLeafIDs.has(d.getID()) && !leafIDs.has(d.getID())) // Is connected AND is external
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "var(--node-color)");

  // Step 4: Highlight all relevant edges (incident to a leaf node in the hovered cluster)
  allEdges
    .filter(
      (d) =>
        leafIDs.has(d.getSource().getID()) || leafIDs.has(d.getTarget().getID())
    )
    .attr("opacity", 1)
    .attr("stroke-width", 4)
    .attr("stroke", (d) => d.edgeColor || "rgb(50, 125, 200)");

  // Step 5: Highlight all relevant inclusion bands (hovered node and all ancestors)
  allInclusions
    .filter((d) => allRelevantNodes.has(d.node)) // Check if the band's node is the hovered node or an ancestor
    .attr("opacity", 1)
    .attr("fill", inclusionColor);

  // Step 6: Highlight the cluster's adjacency cells (internal connections of hovered and ancestor clusters)
  allAdjCells
    .filter((d) => allRelevantNodes.has(d.source.getParent()))
    .attr("opacity", 1)
    .each(function (d) {
      const cellColor = d && d.color ? d.color : "lightgray";
      d3.select(this).select("use").attr("fill", cellColor);
    });

  // Step 7: HIGHLIGHT ROWS/COLUMNS OF MATRICES
  allAdjCells
    .filter(
      (d) =>
        (d.source.getParent() === data.getParent() &&
          allRelevantNodes.has(d.source)) ||
        (d.target.getParent() === data.getParent() &&
          allRelevantNodes.has(d.target)) ||
        (allRelevantNodes.has(d.source) &&
          allRelevantNodes.has(d.target.getParent())) ||
        (allRelevantNodes.has(d.target) &&
          allRelevantNodes.has(d.source.getParent()))
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
    .attr("fill", "var(--node-color)"); // Restore to default node color

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
    .attr("stroke-width", 3)
    .attr("stroke", (d) => d.edgeColor || "var(--edge-color)");

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
  const allRelevantNodes = new Set([
    // Source, Target, and all their descendants
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
  const allInclusions = d3
    .select(".cluster-inclusions")
    .selectAll("path.inclusion");
  const allNodes = d3.selectAll("g.node-cell"); // All nodes (cluster and leaf)

  // Step 1. FADE EVERYTHING (Initial global fade)

  // a) Gray out ALL ADJACENCY CELLS
  allAdjCells.attr("opacity", 0.2).each(function (d) {
    const cellColor = d && d.color ? d.color : "lightgray";
    d3.select(this).select("use").attr("fill", cellColor);
  });

  // b) Gray out all inclusion bands
  allInclusions.attr("fill", inclusionColor).attr("opacity", 0.2);

  // c) Gray out all edges
  allEdges
    .attr("stroke", "lightgray")
    .attr("stroke-width", "2")
    .attr("opacity", 0.4);

  // d) Gray out all nodes (cluster and leaf)
  allNodes.attr("opacity", 0.3).selectAll("use").attr("fill", "gray");

  // Step 2. HIGHLIGHTING (Restore opacity/color for relevant elements)

  // a) Highlight all cells belonging to the included (descendant) matrices
  allAdjCells
    .filter((d) => allRelevantNodes.has(d.source.getParent()))
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
        (d.source.getID() === dataSourceID ||
          d.target.getID() === dataTargetID ||
          d.source.getID() === dataTargetID ||
          d.target.getID() === dataSourceID)
    )
    .attr("opacity", 1)
    .each(function (d) {
      d3.select(this).select("use").attr("fill", d.color);
    });

  // c) Highlight the hovered cell itself (ensuring full color/opacity)
  d3.select(this)
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", (d) => d.color);

  // d) Highlight the included clusters (Inclusion Bands)
  allInclusions.filter((d) => allRelevantNodes.has(d.node)).attr("opacity", 1);

  // e) Highlight included vertices (Linear Layout Nodes - the leaves)
  allNodes
    .filter((d) => sourceLeaves.has(d.getID()) || targetLeaves.has(d.getID()))
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "var(--node-color)");

  // f) Highlight the source and target nodes defining the hovered cell (hierarchy view)
  allNodes
    .filter((d) => d === data.source || d === data.target)
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "var(--node-color)");

  // g) Highlight all the relevant nodes
  allNodes
    .filter((d) => allRelevantNodes.has(d))
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "var(--node-color)");

  // h) Highlight only the relevant edges
  allEdges
    .filter((d) => {
      const dSourceID = d.getSource().getID();
      const dTargetID = d.getTarget().getID();
      return (
        (sourceLeaves.has(dSourceID) && targetLeaves.has(dTargetID)) ||
        (sourceLeaves.has(dTargetID) && targetLeaves.has(dSourceID))
      );
    })
    .attr("stroke", (d) => d.edgeColor || "rgb(50, 125, 200)")
    .attr("stroke-width", 4)
    .attr("opacity", 1);

  // === SHOW EDGE LABEL ON HOVER (only for bottommost clusters) ===
  try {
    // Skip if either source or target cluster still has children
    const src = data && data.source;
    const tgt = data && data.target;

    // The cluster object has a .children array if it’s not bottommost
    const srcHasChildren =
      src && Array.isArray(src.children) && src.children.length > 0;
    const tgtHasChildren =
      tgt && Array.isArray(tgt.children) && tgt.children.length > 0;

    if (srcHasChildren || tgtHasChildren) {
      // One of the clusters isn’t bottommost — don’t show label
      return;
    }
    try {
      // 1. Get the source and target nodes (they are already in the data object)
      const sourceNode = data.source;
      const targetNode = data.target;

      // 2. Determine the label text based on the user's rules:

      // Rule 1: Edge-label  first
      let textToShow = data.edgeLabel;

      // Rule 2 & 3: If no label, fall back to end-node rules (label -> ID)
      if (!textToShow) {
        // Determine the text for the source node: label -> ID
        const sourceText = sourceNode.customLabel || sourceNode.getID();
        // Determine the text for the target node: label -> ID
        const targetText = targetNode.customLabel || targetNode.getID();

        // Format the combined label: "SourceNodeLabel/ID — TargetNodeLabel/ID"
        textToShow = `${sourceText} — ${targetText}`;
      } else {
        // Convert number to string if we are using the weight
        textToShow = String(textToShow);
      }
      // 1) Ensure there's an .edge-labels group inside the zoom group (so labels scale/translate with zoom)
      let edgeLabelsGroup = d3.select(".edge-labels");
      if (edgeLabelsGroup.empty()) {
        const zoomGroup = d3.select(".zoom-group");
        if (!zoomGroup.empty()) {
          edgeLabelsGroup = zoomGroup.append("g").attr("class", "edge-labels");
        } else {
          // fallback: append directly to svg (less ideal, but safe)
          edgeLabelsGroup = d3
            .select("svg")
            .append("g")
            .attr("class", "edge-labels");
        }
      }

      // remove previous hover labels
      edgeLabelsGroup.selectAll(".adj-hover-label").remove();

      // 2) Compute center point of the hovered element in screen coordinates
      const cellNode = d3.select(event.currentTarget).node();
      let screenPoint;
      try {
        const bbox = cellNode.getBBox();
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;

        // create an SVGPoint in the cell's local coordinates
        const pt = cellNode.ownerSVGElement.createSVGPoint();
        pt.x = cx;
        pt.y = cy;

        // transform that point to screen coordinates using the cell's CTM
        const cellCTM = cellNode.getScreenCTM();
        screenPoint = pt.matrixTransform(cellCTM);
      } catch (err) {
        // if anything fails, fall back to (0,0) screen coords
        console.warn("Could not compute screen point for hovered cell:", err);
        screenPoint = { x: 0, y: 0 };
      }

      // 3) Convert screen coordinates into the coordinate system of the edgeLabelsGroup
      //    so x/y we set are local to edgeLabelsGroup (so labels follow .zoom-group transform)
      let localPoint = { x: 0, y: 0 };
      try {
        const groupNode = edgeLabelsGroup.node();
        const groupCTM = groupNode.getScreenCTM(); // screen transform of the group
        const inv = groupCTM.inverse(); // inverse to convert screen -> group local
        const svgPoint = cellNode.ownerSVGElement.createSVGPoint();
        svgPoint.x = screenPoint.x;
        svgPoint.y = screenPoint.y;
        const transformed = svgPoint.matrixTransform(inv);
        localPoint.x = transformed.x;
        localPoint.y = transformed.y;
      } catch (err) {
        console.warn("Could not convert screen -> group coords:", err);
        // fallback to using screenPoint directly (may be off when zoomed)
        localPoint.x = screenPoint.x;
        localPoint.y = screenPoint.y;
      }

      // 4) Append the label into the edgeLabelsGroup at the computed local coords
      // --- Place the label to the right of the cluster (robust, uses class "cluster") ---
      try {
        const OFFSET_X = 0; // gap to the right of the cluster
        const OFFSET_Y = 0;

        // Ensure edge-labels group exists under zoom-group when possible
        let edgeLabelsGroup = d3.select(".edge-labels");
        if (edgeLabelsGroup.empty()) {
          const zoomGroup = d3.select(".zoom-group");
          if (!zoomGroup.empty())
            edgeLabelsGroup = zoomGroup
              .append("g")
              .attr("class", "edge-labels");
          else
            edgeLabelsGroup = d3
              .select("svg")
              .append("g")
              .attr("class", "edge-labels");
        }

        // Remove previous hover labels
        edgeLabelsGroup.selectAll(".adj-hover-label").remove();

        // Fallback coords (cell center), will be replaced if cluster bbox is found
        let labelX = localPoint.x + OFFSET_X;
        let labelY = localPoint.y + OFFSET_Y;

        // Walk up from the hovered element to find the nearest ancestor with class "cluster"
        let domNode = event.currentTarget;
        while (
          domNode &&
          domNode !== document &&
          !(
            domNode.classList &&
            domNode.classList.contains &&
            domNode.classList.contains("cluster")
          )
        ) {
          domNode = domNode.parentNode;
        }

        if (domNode && domNode.nodeType === 1) {
          try {
            const clusterNode = domNode; // <g class="cluster"> element
            const svg = clusterNode.ownerSVGElement;
            if (svg && clusterNode.getBBox && clusterNode.getScreenCTM) {
              // Get bbox in cluster-local coordinates
              const bbox = clusterNode.getBBox();

              // Right-edge midpoint in cluster local coordinates
              const localRightX = bbox.x + bbox.width - bbox.width / 4 + 5;
              const localRightY = bbox.y + bbox.height / 2;

              // Create an SVGPoint and transform it to screen coordinates via clusterNode CTM
              const pt = svg.createSVGPoint();
              pt.x = localRightX;
              pt.y = localRightY;
              const screenPt = pt.matrixTransform(clusterNode.getScreenCTM());

              // Now transform screen coordinates into edgeLabelsGroup local coordinates
              const groupNode = edgeLabelsGroup.node();
              if (groupNode && groupNode.getScreenCTM) {
                const inv = groupNode.getScreenCTM().inverse();
                const svgPt = svg.createSVGPoint();
                svgPt.x = screenPt.x;
                svgPt.y = screenPt.y;
                const localForGroup = svgPt.matrixTransform(inv);

                // Anchor label a bit to the right of the cluster right edge
                labelX = localForGroup.x + OFFSET_X;
                labelY = localForGroup.y + OFFSET_Y;
              }
            }
          } catch (err) {
            console.warn(
              "Could not compute cluster right-edge position, falling back to cell center:",
              err
            );
          }
        }

        edgeLabelsGroup
          .append("text")
          .attr("class", "edge-label adj-hover-label")
          .attr("x", labelX)
          .attr("y", labelY)
          .attr("text-anchor", "start")
          .attr("dominant-baseline", "middle")
          .attr("font-family", "var(--font-main)")
          .attr("font-weight", "bold")
          .attr("font-size", window.currentLabelSize || 15)
          .attr("fill", "var(--edge-color)")
          .attr("pointer-events", "none")
          .style("opacity", 0)
          .text(textToShow)
          .transition()
          .duration(120)
          .style("opacity", 0.9);
      } catch (err) {
        console.warn("mouseEntersAdjCell: label placement failed", err);
      }
    } catch (err) {
      console.warn("mouseEntersAdjCell: could not show label:", err);
    }
  } catch (err) {
    console.warn("mouseEntersAdjCell: could not show label:", err);
  }
}

export function mouseLeavesAdjCell() {
  // === REMOVE HOVER LABEL ===
  d3.select(".edge-labels")
    .selectAll(".adj-hover-label")
    .transition()
    .duration(100)
    .style("opacity", 0)
    .remove();

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
    .attr("fill", "var(--node-color)"); // Restore to default node color

  // 3. Restore all linear edges
  d3.select(".linear-edges")
    .selectAll("path.edge")
    .attr("opacity", 1)
    .attr("stroke", (d) => d.edgeColor || "var(--edge-color)")
    .attr("stroke-width", 3);

  // 4. Restore all inclusion bands
  d3.select(".cluster-inclusions")
    .selectAll("path.inclusion")
    .attr("opacity", 1)
    .attr("fill", inclusionColor);
}

export function mouseEntersEdge(
  event,
  data,
  xCoordMap,
  yCoordMap,
  edgeLabelsGroup
) {
  const sourceNode = data.getSource();
  const targetNode = data.getTarget();

  // 1. Define selections
  const allAdjCells = d3.selectAll(".adjacency g.adjacency-cell");
  const allEdges = d3.select(".linear-edges").selectAll("path.edge");
  const allInclusions = d3
    .select(".cluster-inclusions")
    .selectAll("path.inclusion");
  const allNodes = d3.selectAll("g.node-cell"); // All nodes (cluster and leaf)

  // 2. FADE EVERYTHING
  allAdjCells.attr("opacity", 0.2);
  allInclusions.attr("opacity", 0.2).attr("fill", inclusionColor);
  allEdges
    .attr("opacity", 0.1)
    .attr("stroke", "lightgray")
    .attr("stroke-width", "2");
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
  d3.select(event.currentTarget)
    .attr("opacity", 1)
    .attr("stroke", data.edgeColor || "var(--edge-color)")
    .attr("stroke-width", "4");

  // b) Highlight the endpoint leaf nodes (linear layout/hierarchy view)
  allNodes
    .filter((d) => d === sourceNode || d === targetNode)
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "var(--node-color)");

  // c) Highlight the ancestor inclusion bands (i.e., C1-P1, P1-G1, etc.)
  allInclusions
    .filter((d) => ancestorNodes.has(d.node))
    .attr("opacity", 1)
    .attr("fill", inclusionColor);

  // d) Highlight the ancestor matrices (adjacency cells)
  allAdjCells
    .filter((d) => ancestorNodes.has(d.source.getParent()))
    .attr("opacity", 1)
    .each(function (d) {
      d3.select(this).select("use").attr("fill", d.color);
    });

  // e) Highlight ONLY the ancestor cluster headers (not the other leaf nodes).
  allNodes
    .filter((d) => d.getNodeType() !== 0 && ancestorNodes.has(d)) // Filter for non-leaf nodes that are in the ancestor set
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "var(--node-color)");

  // First, check for an existing edge label
  let labelText = data.getLabel();

  // If the edge itself is unlabeled (or has no weight), apply the end-node rules
  if (!labelText) {
    const sourceNode = data.getSource();
    const targetNode = data.getTarget();

    // Determine the text for the source node: use customLabel, otherwise use ID
    const sourceText = sourceNode.customLabel || sourceNode.getID();
    // Determine the text for the target node: use customLabel, otherwise use ID
    const targetText = targetNode.customLabel || targetNode.getID();

    // Format the combined label: "SourceNodeLabel/ID — TargetNodeLabel/ID"
    labelText = `${sourceText} — ${targetText}`;
  }

  // Show edge label
  const x1 = xCoordMap.get(data.getSource());
  const x2 = xCoordMap.get(data.getTarget());
  const y = yCoordMap.get(data.getSource());

  if (x1 !== undefined && x2 !== undefined && y !== undefined) {
    const midX = (x1 + x2) / 2;
    const xDist = Math.abs(x2 - x1);

    const curveHeight = xDist / 3;
    const midY = y + curveHeight;

    if (labelText) {
      edgeLabelsGroup.selectAll(".edge-label").remove();

      edgeLabelsGroup.raise();

      edgeLabelsGroup
        .append("text")
        .attr("class", "edge-label")
        .attr("x", midX)
        .attr("y", midY + 5)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "hanging")
        .attr("font-family", "var(--font-main)")
        .attr("font-size", window.currentLabelSize || 15)
        .attr("font-weight", "bold")
        .attr("fill", "var(--edge-color)") //data.edgeColor || "var(--edge-color)")
        .attr("pointer-events", "none")
        .style("user-select", "none")
        .style("opacity", 1)
        .text(labelText);
    }
  }
}

export function mouseLeavesEdge(event, edgeLabelsGroup) {
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
    .attr("fill", "var(--node-color)");

  // 3. Restore all linear edges
  d3.select(".linear-edges")
    .selectAll("path.edge")
    .attr("opacity", 1)
    .attr("stroke", (d) => d.edgeColor || "var(--edge-color)")
    .attr("stroke-width", 3);

  // 4. Restore all inclusions
  d3.select(".cluster-inclusions")
    .selectAll("path.inclusion")
    .attr("opacity", 1)
    .attr("fill", inclusionColor);

  // 5. Restore tree cells
  d3.selectAll(".tree-cell")
    .attr("opacity", 1)
    .selectAll("use")
    .attr("fill", "var(--tree-color)");

  // 6. Hide edge label (New Logic)
  if (edgeLabelsGroup) {
    edgeLabelsGroup.selectAll(".edge-label").remove();
  }
}
