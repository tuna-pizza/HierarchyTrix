import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const inclusionColor = "var(--tree-color)"; // Original color from drawer_d3.js (treecolor)

// 1. State variable at the top level (after imports)
let lockedNode = null;

// 2. Function to handle node clicks
export function nodeClicked(event, data) {
  event.stopPropagation(); // Prevent the click from bubbling to the background

  if (lockedNode === data) {
    // If clicking the currently locked node, unlock it
    lockedNode = null;
    mouseLeavesNodeCell();
  } else {
    // Lock the new node
    lockedNode = data;
    // Force the highlight logic immediately (using .call to bind 'this' correctly)
    mouseEntersNodeCell.call(event.currentTarget, event, data);
  }
}

// 3. Function to handle background clicks
export function backgroundClicked() {
  if (lockedNode !== null) {
    lockedNode = null;
    mouseLeavesNodeCell(); // Reset to default view
  }
}

export function mouseEntersNodeCell() {
  const nodeCell = d3.select(this);
  const data = nodeCell.datum();

  if (lockedNode !== null && lockedNode !== data) return;

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

  d3.selectAll(".leaf-label").style("opacity", function () {
    const id = this.parentNode.getAttribute("data-leaf-id");
    return leafIDs.has(id) || connectedLeafIDs.has(id) ? 1.0 : 0.2;
  });

  d3.selectAll(".leaf-labels .label-background").style("opacity", function () {
    const id = this.parentNode.getAttribute("data-leaf-id");
    return leafIDs.has(id) || connectedLeafIDs.has(id) ? 0.7 : 0;
  });

  const descendants = [data, ...data.getDescendants()];
  const allRelevantNodes = new Set(descendants);

  // --- IDENTIFY ANCESTORS ---
  // Create a set for all ancestors (parents, grandparents, etc.)
  const ancestorNodes = new Set();
  let currentParent = data.getParent();
  while (currentParent) {
    ancestorNodes.add(currentParent);
    currentParent = currentParent.getParent();
  }

  // Merge ancestor nodes into the set of nodes to be highlighted
  ancestorNodes.forEach((node) => allRelevantNodes.add(node));

  // Step 1: Fade ALL non-relevant elements

  // a) Fade all *cluster nodes* (but preserve linear nodes and the hovered cluster's internal nodes)
  allNodeCells
    .filter((d) => d.getNodeType() !== 0) // Target only cluster nodes
    .filter((d) => !allRelevantNodes.has(d)) // Exclude the hovered cluster, its descendants, AND its ancestors
    .attr("opacity", 0.2)
    .selectAll("use")
    .attr("fill", "gray");

  // b) Fade all edges
  allEdges
    .attr("opacity", 0.2)
    .attr("stroke", "lightgray")
    .attr("fill", "lightgray");

  // c) Fade all inclusion bands
  allInclusions.attr("opacity", 0.2).attr("fill", "lightgray");

  // d) Identify and fade ONLY adjacency cells NOT in a relevant cluster (hovered cluster or any ancestor)
  // We check against the parent of the adjacency cell's source node.
  allAdjCells
    .filter((d) => !allRelevantNodes.has(d.source.getParent()))
    .attr("opacity", 0.2)
    .each(function (d) {
      d3.select(this).select("use").attr("fill", "lightgray");
    });

  // Step 2: Highlight the hovered node, its descendants, and its ancestors (headers and leaves)
  allNodeCells
    .filter((d) => allRelevantNodes.has(d))
    .attr("opacity", 1) // Restore opacity to 1
    .each(function (d) {
      const nodeType = d.getNodeType();
      const cell = d3.select(this).select("use");

      if (nodeType === "Cluster" && window.HCGDrawer) {
        // Recalculate and apply the cluster color
        const finalColor = window.HCGDrawer.getClusterNodeCalculatedColor(d);
        cell.attr("fill", finalColor);
      } else if (nodeType === "Vertex") {
        // Apply the default color for leaf nodes
        cell.attr("fill", "var(--node-color)");
      }
    });

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
    .attr("stroke-width", 3)
    .attr("stroke", (d) => d.edgeColor || "rgb(50, 125, 200)")
    .attr("fill", (d) => d.edgeColor || "rgb(50, 125, 200)");

  // Step 5: Highlight all relevant inclusion bands (hovered node and all ancestors)
  allInclusions
    .filter((d) => allRelevantNodes.has(d.node)) // Check if the band's node is the hovered node or an ancestor
    .attr("opacity", 1)
    .attr("fill", inclusionColor);

  // Step 6: Dim background cells in relevant matrices for contrast.
  allAdjCells
    .filter(
      (d) =>
        // 1. Must be in a relevant matrix (a cluster that is the hovered node, an ancestor, or a descendant)
        allRelevantNodes.has(d.source.getParent()) &&
        // 2. Must NOT be on the row/column corresponding to a relevant node (hovered, ancestor, or descendant)
        !(allRelevantNodes.has(d.source) || allRelevantNodes.has(d.target))
    )
    .attr("opacity", 0.2);

  // Step 7: HIGHLIGHT ROWS/COLUMNS OF MATRICES
  allAdjCells
    .filter(
      (d) => allRelevantNodes.has(d.source) || allRelevantNodes.has(d.target)
    )
    .attr("opacity", 1)
    .each(function (d) {
      const cellColor = d && d.color ? d.color : "lightgray";
      d3.select(this).select("use").attr("fill", cellColor);
    });

  // Step 8: Fade all cluster labels except the node's and its ancestors'
  // 1. Identify all cluster node IDs that should remain visible (hovered node + ancestors)
  const relevantClusterIDs = new Set(
    Array.from(allRelevantNodes)
      .filter((n) => n.getNodeType() !== 0) // Filter to only include cluster nodes
      .map((n) => String(n.getID()))
  );

  // 2. Dim ALL cluster labels
  d3.selectAll(".cluster-label").style("opacity", 0.2);

  // 3. Highlight only the labels that match the relevant cluster IDs
  d3.selectAll(".cluster-label").style("opacity", function () {
    const labelText = d3.select(this).text().trim();
    if (relevantClusterIDs.has(labelText)) {
      return 1.0;
    } else {
      return 0.2;
    }
  });

  // Step 9: Highlight relevant cluster node labels (tilted)
  d3.selectAll(".cluster-node-label").style("opacity", function () {
    const labelText = d3.select(this).text().trim();
    return relevantClusterIDs.has(labelText) ? 1.0 : 0.2;
  });

  d3.selectAll(".cluster-node-labels .label-background").style(
    "opacity",
    function () {
      const id = this.parentNode.getAttribute("data-cluster-id");
      return relevantClusterIDs.has(id) ? 0.7 : 0;
    }
  );

  // --- CLUSTER NODE HOVER LABEL LOGIC ---
  const drawer = window.HCGDrawer;
  // Ensure we use the correct group for labels
  const edgeLabelsGroup = d3.select(".edge-labels");

  if (edgeLabelsGroup && !edgeLabelsGroup.empty()) {
    edgeLabelsGroup.selectAll(".adj-hover-label").remove();
  }

  // ONLY proceed if it's a Cluster Node (not a leaf)
  if (data.getNodeType() === "Cluster" && drawer) {
    const labelStats = drawer.getClusterNodeLabelStats(data);

    if (labelStats) {
      const textToShow = labelStats.labelText; // "Value: X.XX"
      const labelColor = labelStats.textColor; // --cluster-node-color-high

      const OFFSET_X = 0; // Final offset after all transforms
      const OFFSET_Y = 0;

      // 1. Compute cell center point in local coordinates (used for initial localPoint)
      const cellNode = event.currentTarget;
      let localPoint = { x: 0, y: 0 };
      let screenPoint;

      try {
        const bbox = cellNode.getBBox();
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;

        const pt = cellNode.ownerSVGElement.createSVGPoint();
        pt.x = cx;
        pt.y = cy;

        screenPoint = pt.matrixTransform(cellNode.getScreenCTM());

        const groupNode = edgeLabelsGroup.node();
        const groupCTM = groupNode.getScreenCTM();
        const inv = groupCTM.inverse();
        const svgPoint = cellNode.ownerSVGElement.createSVGPoint();
        svgPoint.x = screenPoint.x;
        svgPoint.y = screenPoint.y;
        const transformed = svgPoint.matrixTransform(inv);
        localPoint.x = transformed.x;
        localPoint.y = transformed.y;
      } catch (err) {
        console.warn(
          "Could not compute initial screen point for hovered cell:",
          err
        );
        localPoint = { x: 20, y: 20 }; // Fallback to cell center
      }

      // 2. Compute final label position based on Cluster Ancestor BBox
      // Fallback coords (initial cell center localPoint), will be replaced if cluster bbox is found
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
            const bbox = clusterNode.getBBox();

            // Right-edge midpoint in cluster local coordinates (5px margin)
            const localRightX = bbox.x + bbox.width - bbox.width / 4 + 5;
            const localRightY = bbox.y + bbox.height / 2;

            // Transform cluster local point to screen coordinates
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

              // Anchor label to the computed right-edge position
              labelX = localForGroup.x + OFFSET_X;
              labelY = localForGroup.y + OFFSET_Y;
            }
          }
        } catch (err) {
          console.warn(
            "Could not compute cluster right-edge position for node cell label, falling back to cell center:",
            err
          );
        }
      }

      const lines = textToShow.split("\n");

      const textElement = edgeLabelsGroup
        .append("text")
        .attr("class", "edge-label adj-hover-label")
        .attr("x", labelX)
        .attr("y", labelY)
        .attr("text-anchor", "start")
        .attr("dominant-baseline", "middle")
        .attr("font-family", "var(--font-main)")
        .attr("font-weight", "bold")
        .attr("font-size", window.currentLabelSize || 15)
        .attr("fill", labelColor)
        .attr("pointer-events", "none")
        .style("opacity", 1);

      lines.forEach((line, i) => {
        textElement
          .append("tspan")
          .attr("x", labelX)
          // Use 'em' unit relative to the current font size
          .attr("dy", i === 0 ? "0em" : "1.2em")
          .text(line);

        const bbox = textElement.node().getBBox();

        // Insert a white rect with opacity 0.7 BEFORE the text element (using "text" as the selector)
        edgeLabelsGroup
          .insert("rect", "text")
          .attr("class", "label-background-rect")
          .attr("x", bbox.x - 3)
          .attr("y", bbox.y - 2)
          .attr("width", bbox.width + 5)
          .attr("height", bbox.height + 4)
          .attr("rx", 3)
          .attr("ry", 3)
          .attr("fill", "white")
          .attr("opacity", 0.5);
      });
    }
  }
}

export function mouseLeavesNodeCell() {
  if (lockedNode !== null) return;

  // 1. Restore all node cells AND their correct colors
  restoreNodeColoring();

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
    .attr("stroke-width", 2)
    .attr("stroke", (d) => d.edgeColor || "var(--edge-color)")
    .attr("fill", (d) => d.edgeColor || "var(--edge-color)");

  // 4. Restore all inclusion bands
  d3.select(".cluster-inclusions")
    .selectAll("path.inclusion")
    .attr("opacity", 1)
    .attr("fill", inclusionColor);

  // 5. Restore Leaf Labels AND Cluster Node Labels
  d3.selectAll(".leaf-label").style("opacity", 1.0);
  d3.selectAll(".leaf-labels .label-background").style("opacity", 0.7);

  d3.selectAll(".cluster-node-label").style("opacity", 1.0);
  d3.selectAll(".cluster-node-labels .label-background").style("opacity", 0.7);

  d3.selectAll(".cluster-label").style("opacity", 1.0);

  // 5. Hide edge label
  const edgeLabelsGroup = d3.select(".edge-labels");
  if (edgeLabelsGroup) {
    edgeLabelsGroup.selectAll(".adj-hover-label").remove();
    d3.selectAll(".label-background-rect").style("opacity", 0).remove();
  }
}

export function mouseEntersAdjCell(event, data) {
  if (lockedNode !== null) return;

  let adjCellExtraText = "";

  const [x, y] = d3.pointer(event, this);

  let part = "";

  // 2. Geometric check for diagonal split (from top-left (0,0) to bottom-right (cellSize, cellSize))
  if (y < x) {
    // Upper-Left Triangle: Represents the connection (row node) -> (column node)
    part = "left";
  } else if (y >= x) {
    // Lower-Right Triangle: Represents the connection (column node) -> (row node)
    part = "right";
  }

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

  // Identify all relevant parts
  let leaves = data.source.getLeaves();
  leaves = leaves.concat(data.target.getLeaves());
  const leafIDs = new Set(leaves.map((n) => n.getID()));

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

  d3.selectAll(".leaf-label").style("opacity", function () {
    const id = this.parentNode.getAttribute("data-leaf-id");
    return leafIDs.has(id) || connectedLeafIDs.has(id) ? 1.0 : 0.2;
  });

  d3.selectAll(".leaf-labels .label-background").style("opacity", function () {
    const id = this.parentNode.getAttribute("data-leaf-id");
    return leafIDs.has(id) || connectedLeafIDs.has(id) ? 0.7 : 0;
  });

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
    .attr("fill", "lightgray")
    .attr("stroke-width", "2")
    .attr("opacity", 0.2);

  // d) Gray out all nodes (cluster and leaf)
  allNodes.attr("opacity", 0.2).selectAll("use").attr("fill", "gray");

  // f) Gray out other cluster labels based on the matrix level ---
  const sourceNode = data.source;
  const targetNode = data.target;

  // detect bottommost matrix: both source and target are clusters with no children
  const sourceIsLeafCluster =
    !sourceNode.children || sourceNode.children.length === 0;
  const targetIsLeafCluster =
    !targetNode.children || targetNode.children.length === 0;

  const isBottommostLevel = sourceIsLeafCluster && targetIsLeafCluster;

  // Set 1 (relevantIDs): For Tilted Node Labels. Includes A, B, and descendants, but EXCLUDES M.
  // This causes M's tilted label to fade (as requested).
  const relevantIDs = new Set();

  // Set 2 (horizontalLabelHighlightIDs): For Horizontal Cluster Labels. Includes M, A, B, and descendants.
  // This causes M's horizontal label to highlight (as requested).
  const horizontalLabelHighlightIDs = new Set();

  if (parentCluster) {
    // M's ID is explicitly added to the horizontal set for HIGHLIGHTING the current matrix's name.
    horizontalLabelHighlightIDs.add(String(parentCluster.getID()));
  }

  if (!isBottommostLevel) {
    // Only run this logic for high-level matrices (Case 2: Cluster-Cluster)
    const A = data.source;
    const B = data.target;

    // Add A and descendants to both sets
    const descendantsOfA = [A, ...A.getDescendants()];
    descendantsOfA.forEach((node) => {
      const id = String(node.getID());
      relevantIDs.add(id);
      horizontalLabelHighlightIDs.add(id);
    });

    // Add B and descendants to both sets
    if (A !== B) {
      const descendantsOfB = [B, ...B.getDescendants()];
      descendantsOfB.forEach((node) => {
        const id = String(node.getID());
        relevantIDs.add(id);
        horizontalLabelHighlightIDs.add(id);
      });
    }
  }

  // 1. Apply to Standard Horizontal Cluster Labels (.cluster-label)
  d3.selectAll(".cluster-label").style("opacity", function () {
    const labelText = d3.select(this).text().trim();
    return horizontalLabelHighlightIDs.has(labelText) ? 1.0 : 0.2;
  });

  // 2. Apply to New Tilted Cluster Node Labels (.cluster-node-label)
  d3.selectAll(".cluster-node-label").style("opacity", function () {
    const labelText = d3.select(this).text().trim();
    return relevantIDs.has(labelText) ? 1.0 : 0.2;
  });

  // 3. Apply to New Tilted Cluster Node Backgrounds
  d3.selectAll(".cluster-node-labels .label-background").style(
    "opacity",
    function () {
      const id = this.parentNode.getAttribute("data-cluster-id");
      return relevantIDs.has(id) ? 0.7 : 0;
    }
  );

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

  // e, f, g) Consolidate node highlighting: Leaf nodes get default color, Cluster nodes get calculated color
  allNodes
    .filter((d) => allRelevantNodes.has(d)) // Highlight ALL relevant nodes
    .attr("opacity", 1) // Restore full opacity
    .each(function (d) {
      const nodeType = d.getNodeType();

      if (nodeType === "Cluster") {
        // Check for Cluster
        // Restore calculated color for Cluster Nodes (override 'gray' fade)
        if (
          window.HCGDrawer &&
          typeof window.HCGDrawer.H.getIntraClusterStats === "function"
        ) {
          const computedStyle = getComputedStyle(document.body);
          let colorLow =
            computedStyle
              .getPropertyValue("--cluster-node-color-low")
              ?.trim() || "#ffffff";
          let colorHigh =
            computedStyle
              .getPropertyValue("--cluster-node-color-high")
              ?.trim() || "#1e90ff";

          const scale = d3
            .scaleLinear()
            .range([colorLow, colorHigh])
            .clamp(true);

          const toggle = document.getElementById("edge-display-toggle");
          const isAbsolute = toggle ? toggle.checked : false;

          let maxEdges = 0;
          if (isAbsolute) {
            window.HCGDrawer.H.getNodes().forEach((n) => {
              if (n.getNodeType() === "Cluster") {
                const stats = window.HCGDrawer.H.getIntraClusterStats(n);
                if (stats.actualEdges > maxEdges) maxEdges = stats.actualEdges;
              }
            });
            scale.domain([0, Math.max(maxEdges, 1)]);
          } else {
            scale.domain([0, 1]);
          }

          const stats = window.HCGDrawer.H.getIntraClusterStats(d);
          const value = isAbsolute ? stats.actualEdges : stats.ratio;
          let finalColor = scale(value);

          // Apply zero-value override
          if (value === 0) {
            finalColor = "rgb(255,255,255)";
          }

          d3.select(this).select("use").attr("fill", finalColor);
        } else {
          d3.select(this).select("use").attr("fill", "var(--node-color)");
        }
      } else {
        // Assuming NodeType === 'Vertex'
        // If it's a Leaf Node, ensure it's set to the default node color (overriding gray)
        d3.select(this).select("use").attr("fill", "var(--node-color)");
      }
    });

  allNodes
    .filter((d) => connectedLeafIDs.has(d.id))
    .attr("opacity", 1)
    .select("use")
    .attr("fill", "var(--node-color)");

  // h) Highlight only the relevant edges
  allEdges
    .filter((d) => {
      const dSourceID = d.getSource().getID();
      const dTargetID = d.getTarget().getID();
      return (
        (sourceLeaves.has(dSourceID) && targetLeaves.has(dTargetID)) ||
        (sourceLeaves.has(dTargetID) && targetLeaves.has(dSourceID)) ||
        (connectedLeafIDs.has(dSourceID) && leafIDs.has(dTargetID)) ||
        (connectedLeafIDs.has(dTargetID) && leafIDs.has(dSourceID))
      );
    })
    .attr("stroke", (d) => d.edgeColor || "rgb(50, 125, 200)")
    .attr("fill", (d) => d.edgeColor || "rgb(50, 125, 200)")
    .attr("stroke-width", 3)
    .attr("opacity", 1);

  // === SHOW EDGE LABEL ON HOVER (only for bottommost clusters) ===
  try {
    if (!isBottommostLevel) {
      // This is a non-bottommost level matrix (Cluster-Cluster cell)
      const actualEdges = data.actualEdges;
      const potentialEdges = data.potentialEdges;

      // Ensure we don't divide by zero
      const ratio = potentialEdges > 0 ? actualEdges / potentialEdges : 0;

      // Get the display mode (assuming it is available via 'this' or defaults to 'absolute')
      const displayMode =
        (window.HCGDrawer && window.HCGDrawer.edgeDisplayMode) || "absolute";
      // Calculate the text and store it in the extra variable
      if (displayMode === "absolute") {
        adjCellExtraText = "Value: " + `${actualEdges}`;
      } else {
        adjCellExtraText = "Value: " + `${parseFloat(ratio.toFixed(2))}`;
      }
    }
    try {
      // 1. Get the source and target nodes (they are already in the data object)
      const sourceNode = data.source;
      const targetNode = data.target;

      // 2. Determine the label text based on the user's rules:

      // Rule 1: Edge-label  first
      let textToShow;

      if (!data.isDirected) {
        if (data.edgeLabels[0] != "") textToShow = data.edgeLabels[0];
        else textToShow = data.edgeLabels[1];
      } else if (part === "left") textToShow = data.edgeLabels[0];
      else textToShow = data.edgeLabels[1];

      // Rule 2 & 3: If no label, fall back to end-node rules (label -> ID)
      if (!textToShow) {
        let trueSourceNode, trueTargetNode;

        // --- LOGIC USING MOUSE POSITION ---
        if (data.isDirected) {
          if (part === "left") {
            // LEFT part (y < x): Display T -> S
            trueSourceNode = targetNode; // T is the logical source for text
            trueTargetNode = sourceNode; // S is the logical target for text
          } else if (part === "right") {
            // RIGHT part (y >= x): Display S -> T
            trueSourceNode = sourceNode; // S is the logical source for text
            trueTargetNode = targetNode; // T is the logical target for text
          }
        } else {
          trueSourceNode = sourceNode; // S is the logical source for text
          trueTargetNode = targetNode; // T is the logical target for text
        }

        // Determine the text for the actual Source node: label -> ID
        const sourceText = trueSourceNode.customLabel || trueSourceNode.getID();
        // Determine the text for the actual Target node: label -> ID
        const targetText = trueTargetNode.customLabel || trueTargetNode.getID();

        // Format the combined label: "TrueSourceNode — TrueTargetNode"
        textToShow = `${sourceText} — ${targetText}`;
      } else {
        // Convert number to string if we are using the weight
        textToShow = String(textToShow);
      }

      if (data && data.isWeightColored) {
        let edgeWeight = null;

        // Safely retrieve weights from both directions using optional chaining
        let weight_t_to_s = data.edge_t_to_s?.weight ?? null;
        let weight_s_to_t = data.edge_s_to_t?.weight ?? null;

        if (data.isDirected) {
          // 1. DIRECTED LOGIC: Respect the triangle part based on your confirmed mapping
          if (part === "left") {
            edgeWeight = weight_s_to_t;
          } else if (part === "right") {
            edgeWeight = weight_t_to_s;
          }
        } else {
          // 2. UNDIRECTED LOGIC: Use the single stored weight, regardless of part
          // The weight is the same for both halves; use whichever is not null.
          edgeWeight = weight_t_to_s !== null ? weight_t_to_s : weight_s_to_t;
        }

        // Only append the text if a valid weight value was found (0 is valid, null/undefined is not)
        if (edgeWeight !== null && edgeWeight !== undefined) {
          // Append the weight with a label
          textToShow = `Weight: ${edgeWeight}\n` + textToShow;
        }
      }

      // ---Append the "Value: " line for non-bottommost cells ---
      if (adjCellExtraText) {
        textToShow = `${adjCellExtraText}\n${textToShow}`;
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

        const lines = textToShow.split("\n");

        const textElement = edgeLabelsGroup
          .append("text")
          .attr("class", "edge-label adj-hover-label")
          .attr("x", labelX)
          .attr("y", labelY)
          .attr("text-anchor", "start")
          .attr("dominant-baseline", "middle")
          .attr("font-family", "var(--font-main)")
          .attr("font-weight", "bold")
          .attr("font-size", window.currentLabelSize || 15)
          .attr(
            "fill",
            isBottommostLevel ? "var(--edge-color)" : "var(--adj-color-high)"
          )
          .attr("pointer-events", "none")
          .style("opacity", 1);

        lines.forEach((line, i) => {
          textElement
            .append("tspan")
            // Set x coordinate for alignment (required for tspan)
            .attr("x", labelX)
            // Use dy to offset the lines vertically
            // Start the first line at 0em offset, and subsequent lines by 1.2em
            .attr("dy", i === 0 ? "0em" : "-1.2em")
            .text(line);

          const bbox = textElement.node().getBBox();

          // Insert a white rect with opacity 0.7 BEFORE the text element (using "text" as the selector)
          edgeLabelsGroup
            .insert("rect", "text")
            .attr("class", "label-background-rect")
            .attr("x", bbox.x - 3)
            .attr("y", bbox.y - 2)
            .attr("width", bbox.width + 5)
            .attr("height", bbox.height + 4)
            .attr("rx", 3)
            .attr("ry", 3)
            .attr("fill", "white")
            .attr("opacity", 0.5);
        });
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
  if (lockedNode !== null) return;

  // === REMOVE HOVER LABEL ===
  d3.select(".edge-labels")
    .selectAll(".adj-hover-label")
    .transition()
    .duration(100)
    .style("opacity", 0)
    .remove();

  d3.selectAll(".label-background-rect").style("opacity", 0).remove();

  // 1. Restore all adjacency cells
  d3.selectAll(".adjacency g.adjacency-cell")
    .attr("opacity", 1)
    .each(function (d) {
      const cellColor = d && d.color ? d.color : "lightgray";
      d3.select(this).select("use").attr("fill", cellColor);
    });

  // 2. Restore ALL nodes (cluster and leaf)
  d3.selectAll("g.node-cell").attr("opacity", 1);
  // Re-apply the correct coloring logic
  if (
    window.HCGDrawer &&
    typeof window.HCGDrawer.updateNodeColoring === "function"
  ) {
    window.HCGDrawer.updateNodeColoring();
  } else {
    // Fallback if drawer not ready
    d3.selectAll("g.node-cell selectAll use").attr("fill", "var(--node-color)");
  }

  // 3. Restore all linear edges
  d3.select(".linear-edges")
    .selectAll("path.edge")
    .attr("opacity", 1)
    .attr("stroke", (d) => d.edgeColor || "var(--edge-color)")
    .attr("stroke-width", 2)
    .attr("fill", (d) => d.edgeColor || "var(--edge-color)");

  // 4. Restore all inclusion bands
  d3.select(".cluster-inclusions")
    .selectAll("path.inclusion")
    .attr("opacity", 1)
    .attr("fill", inclusionColor);

  // 5. restore labels and rects
  d3.selectAll(".leaf-label").style("opacity", 1.0);
  d3.selectAll(".leaf-labels .label-background").style("opacity", 0.7);

  d3.selectAll(".cluster-node-label").style("opacity", 1.0);
  d3.selectAll(".cluster-node-labels .label-background").style("opacity", 0.7);

  // 6. restore cluster labels that may have been dimmed on adjacency hover
  d3.selectAll(".cluster-label").style("opacity", 1.0);
}

export function mouseEntersEdge(
  event,
  data,
  drawer,
  xCoordMap,
  yCoordMap,
  edgeLabelsGroup,
  cellSize
) {
  // 1. Handle Locked State
  if (lockedNode !== null) {
    // Use IDs to check if the edge connects to the locked node (or its descendants)
    const lockedLeafIDs = new Set(lockedNode.getLeaves().map((n) => n.getID()));
    const sourceID = data.source.getID();
    const targetID = data.target.getID();

    // The edge is incident if its Source OR Target is in the locked set
    const isIncident =
      lockedLeafIDs.has(sourceID) || lockedLeafIDs.has(targetID);

    d3.select(event.currentTarget).attr("stroke-width", "4");

    // If not connected to the clicked node, stop here (don't show label)
    if (!isIncident) return;
  } else {
    const nodeOrder = drawer.nodeOrder;
    if (!nodeOrder || nodeOrder.length === 0) return;

    // 1. Get the string IDs of the source and target for safe comparison
    const sourceNodeID = String(data.source.getID());
    const targetNodeID = String(data.target.getID());

    // 2. Gray out all the nodes labels (except the end-nodes)
    d3.selectAll(".leaf-label").style("opacity", function () {
      const id = this.parentNode.getAttribute("data-leaf-id");
      if (id === sourceNodeID || id === targetNodeID) return 1.0;
      return 0.2;
    });

    d3.selectAll(".leaf-labels .label-background").style(
      "opacity",
      function () {
        const id = this.parentNode.getAttribute("data-leaf-id");
        if (id === sourceNodeID || id === targetNodeID) return 0.7;
        return 0;
      }
    );

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
      .attr("opacity", 0.2)
      .attr("stroke", "lightgray")
      .attr("stroke-width", "2")
      .attr("fill", "lightgray");
    allNodes.attr("opacity", 0.2).selectAll("use").attr("fill", "gray");

    // 3. IDENTIFY ANCESTORS
    const ancestorNodes = new Set();
    let currentSource = sourceNode;
    let currentTarget = targetNode;

    // // OPTION 1
    // Trace ancestors up the tree. This set includes the immediate parent clusters.
    let ancestorsSource = new Array();
    let ancestorsTarget = new Array();
    while (currentSource.getParent()) {
      ancestorsSource.push(currentSource);
      currentSource = currentSource.getParent();
    }
    while (currentTarget.getParent()) {
      ancestorsTarget.push(currentTarget);
      currentTarget = currentTarget.getParent();
    }
    // a) Add nodes from Source path until a node in the Target's ancestors is found
    let node = sourceNode.getParent();
    ancestorNodes.add(node);
    let sourceReachedLCA = false;
    while (node && !sourceReachedLCA) {
      if (ancestorsTarget.includes(node)) {
        // Stop adding nodes once the LCA (or an ancestor of the LCA) is found
        sourceReachedLCA = true;
        currentSource = node;
      } else ancestorNodes.add(node);
      node = node.getParent();
    }
    // b) Add nodes from Target path until a node in the Source's ancestors is found
    node = targetNode.getParent();
    ancestorNodes.add(node);
    let targetReachedLCA = false;
    while (node && !targetReachedLCA) {
      // The Set handles duplicates, so adding a common ancestor (like the LCA) twice is fine

      if (ancestorsSource.includes(node)) {
        // Stop adding nodes once the LCA (or an ancestor of the LCA) is found
        targetReachedLCA = true;
        currentTarget = node;
      } else ancestorNodes.add(node);
      node = node.getParent();
    }
    // // END OPTION 1

    // OPTION 2
    // while (currentSource != currentTarget) {
    //   ancestorNodes.add(currentSource);
    //   ancestorNodes.add(currentTarget);
    //   if (currentSource.getParent()) currentSource = currentSource.getParent();
    //   else break;
    //   if (currentTarget.getParent()) currentTarget = currentTarget.getParent();
    //   else break;
    // }
    // END OPTION 2

    // Apply grey-out/highlight logic to cluster labels
    const relevantIDs = new Set();

    // Add the two lowest-level clusters (u and v) that contain the edge.
    relevantIDs.add(data.source.getID());
    relevantIDs.add(data.target.getID());

    // Add all ancestor matrices collected during the traversal.
    ancestorNodes.forEach((n) => relevantIDs.add(n.getID()));

    if (currentSource) {
      relevantIDs.add(currentSource.getID());
    }
    if (currentTarget) {
      relevantIDs.add(currentTarget.getID());
    }

    // Apply grey-out/highlight logic to cluster labels
    d3.selectAll(".cluster-label").style("opacity", function () {
      // Get the unique cluster ID from the label text (which is assumed to be the ID)
      const labelText = d3.select(this).text().trim();
      // Check if the label's ID is in the set of relevant IDs
      if (relevantIDs.has(labelText)) {
        return 1.0;
      } else {
        // Grey-out all other labels
        return 0.2;
      }
    });

    // Apply grey-out/highlight logic to cluster node labels
    // Next two lines are to not highlight too  much
    relevantIDs.delete(currentSource.getID());
    relevantIDs.delete(currentTarget.getID());

    d3.selectAll(".cluster-node-label").style("opacity", function () {
      const labelText = d3.select(this).text().trim();
      return relevantIDs.has(labelText) ? 1.0 : 0.2;
    });

    d3.selectAll(".cluster-node-labels .label-background").style(
      "opacity",
      function () {
        const id = this.parentNode.getAttribute("data-cluster-id");
        return relevantIDs.has(id) ? 0.7 : 0;
      }
    );

    // 4. HIGHLIGHT RELEVANT ELEMENTS

    // a) Highlight the hovered edge
    d3.select(event.currentTarget)
      .attr("opacity", 1)
      .attr("stroke", data.edgeColor || "var(--edge-color)")
      .attr("stroke-width", "4")
      .attr("fill", data.edgeColor || "var(--edge-color)");

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

    // d) HIGHLIGHT the rows/columns corresponding to the ancestor nodes.
    allAdjCells
      .filter(
        (d) =>
          ancestorNodes.has(d.source) ||
          d.source == data.source ||
          d.source == data.target ||
          ancestorNodes.has(d.target) ||
          d.target == data.target ||
          d.target == data.source
      )
      .attr("opacity", 1)
      .each(function (d) {
        // Ensure the full color is applied, overriding the dimming
        const cellColor = d && d.color ? d.color : "lightgray";
        d3.select(this).select("use").attr("fill", cellColor);
      });

    // e) Highlight ONLY the ancestor cluster headers (not the other leaf nodes).
    allNodes
      .filter((d) => d.getNodeType() !== 0 && ancestorNodes.has(d)) // Filter for non-leaf nodes that are in the ancestor set
      .attr("opacity", 1)
      .each(function (d) {
        // Inline logic to re-calculate and apply color, overriding the 'gray' fade
        if (
          window.HCGDrawer &&
          typeof window.HCGDrawer.H.getIntraClusterStats === "function"
        ) {
          const computedStyle = getComputedStyle(document.body);
          let colorLow =
            computedStyle
              .getPropertyValue("--cluster-node-color-low")
              ?.trim() || "#ffffff";
          let colorHigh =
            computedStyle
              .getPropertyValue("--cluster-node-color-high")
              ?.trim() || "#1e90ff";

          const toggle = document.getElementById("edge-display-toggle");
          const isAbsolute = toggle ? toggle.checked : false;

          // Use the correct scale (d3.scaleLinear)
          const scale = d3
            .scaleLinear()
            .range([colorLow, colorHigh])
            .clamp(true);

          let maxEdges = 0;
          if (isAbsolute) {
            window.HCGDrawer.H.getNodes().forEach((n) => {
              if (n.getNodeType() === "Cluster") {
                const stats = window.HCGDrawer.H.getIntraClusterStats(n);
                if (stats.actualEdges > maxEdges) maxEdges = stats.actualEdges;
              }
            });
            scale.domain([0, Math.max(maxEdges, 1)]);
          } else {
            scale.domain([0, 1]);
          }

          const stats = window.HCGDrawer.H.getIntraClusterStats(d);
          const value = isAbsolute ? stats.actualEdges : stats.ratio;
          let finalColor = scale(value);

          // Apply zero-value override
          if (value === 0) {
            finalColor = "rgb(255,255,255)";
          }

          d3.select(this).select("use").attr("fill", finalColor);
        }
      });
  }
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

  if (data.weight !== null && data.weight !== undefined) {
    labelText = labelText + `\nWeight: ${data.weight}`;
  }

  // Show edge label
  const x1 = xCoordMap.get(data.getSource());
  const x2 = xCoordMap.get(data.getTarget());
  const y = yCoordMap.get(data.getSource());

  if (x1 !== undefined && x2 !== undefined && y !== undefined) {
    const midX = (x1 + x2) / 2;
    const xDist = Math.abs(x2 - x1);

    const curveHeight = xDist / 5 + cellSize / 1.5;
    const midY = y + curveHeight;

    if (labelText) {
      let lines = [];
      if (typeof labelText === "string") {
        lines = labelText.split("\n");
      } else if (labelText !== null && labelText !== undefined) {
        // Fallback for non-string types that might be assigned (like numbers)
        lines = String(labelText).split("\n");
      } else {
        // If labelText is null/undefined/empty after checks, skip rendering
        return;
      }

      edgeLabelsGroup.selectAll(".edge-label").remove();

      edgeLabelsGroup.raise();

      const textElement = edgeLabelsGroup
        .append("text")
        .attr("class", "edge-label")
        .attr("x", midX)
        .attr("y", midY + 7)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "hanging")
        .attr("font-family", "var(--font-main)")
        .attr("font-size", window.currentLabelSize || 15)
        .attr("font-weight", "bold")
        .attr("fill", "var(--edge-color)") //data.edgeColor || "var(--edge-color)")
        .attr("pointer-events", "none")
        .style("user-select", "none")
        .style("opacity", 1);

      // Append a <tspan> for each line
      lines.forEach((line, i) => {
        textElement
          .append("tspan")
          // Set x coordinate for alignment (required for tspan)
          .attr("x", midX)
          // Use dy to offset the lines vertically
          // Start the first line at 0em offset, and subsequent lines by 1.2em
          .attr("dy", i === 0 ? "0em" : "1.2em")
          .text(line);

        const bbox = textElement.node().getBBox();

        // Insert a white rect with opacity 0.7 BEFORE the text element (using "text" as the selector)
        edgeLabelsGroup
          .insert("rect", "text")
          .attr("class", "label-background-rect")
          .attr("x", bbox.x - 3)
          .attr("y", bbox.y - 2)
          .attr("width", bbox.width + 5)
          .attr("height", bbox.height + 4)
          .attr("rx", 3)
          .attr("ry", 3)
          .attr("fill", "white")
          .attr("opacity", 0.5);
      });
    }
  }
}

export function mouseLeavesEdge(event, edgeLabelsGroup) {
  // 1. Handle Locked State
  if (lockedNode !== null) {
    // Remove the label
    if (edgeLabelsGroup) {
      edgeLabelsGroup.selectAll(".edge-label").remove();
      edgeLabelsGroup.selectAll(".label-background-rect").remove();
    }

    // Restore the edge stroke to the "highlighted" width (3)
    // instead of the "default" width (2)
    d3.select(event.currentTarget).attr("stroke-width", 3);

    return; // STOP here, do not restore the rest of the graph
  }

  d3.selectAll(".label-background-rect").style("opacity", 0).remove();

  // 2. Handle Unlocked State (Restore everything)

  // 1. Restore all adjacency cells
  d3.selectAll(".adjacency g.adjacency-cell")
    .attr("opacity", 1)
    .each(function (d) {
      const cellColor = d && d.color ? d.color : "lightgray";
      d3.select(this).select("use").attr("fill", cellColor);
    });

  // 2. Restore ALL nodes (cluster and leaf)
  d3.selectAll("g.node-cell").attr("opacity", 1);
  // Re-apply the correct coloring logic
  if (
    window.HCGDrawer &&
    typeof window.HCGDrawer.updateNodeColoring === "function"
  ) {
    window.HCGDrawer.updateNodeColoring();
  } else {
    // Fallback if drawer not ready
    d3.selectAll("g.node-cell selectAll use").attr("fill", "var(--node-color)");
  }

  // 3. Restore all linear edges
  d3.select(".linear-edges")
    .selectAll("path.edge")
    .attr("opacity", 1)
    .attr("stroke", (d) => d.edgeColor || "var(--edge-color)")
    .attr("stroke-width", 2)
    .attr("fill", (d) => d.edgeColor || "var(--edge-color)");

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

  // 7. Restore the opacity of ALL external node labels
  d3.selectAll(".leaf-label").style("opacity", 1.0);
  d3.selectAll(".leaf-labels .label-background").style("opacity", 0.7);

  d3.selectAll(".cluster-node-label").style("opacity", 1.0);
  d3.selectAll(".cluster-node-labels .label-background").style("opacity", 0.7);

  // 8. restore cluster labels that may have been dimmed on adjacency hover
  d3.selectAll(".cluster-label").style("opacity", 1.0);
}

function restoreNodeColoring() {
  // 1. Restore all node cells opacity
  d3.selectAll("g.node-cell").attr("opacity", 1);

  // 2. Apply correct color based on node type
  if (
    window.HCGDrawer &&
    typeof window.HCGDrawer.getClusterNodeCalculatedColor === "function"
  ) {
    d3.selectAll("g.node-cell").each(function (d) {
      const nodeType = d.getNodeType();
      if (nodeType === "Cluster") {
        // Use the refactored utility to get the correct cluster color
        const finalColor = window.HCGDrawer.getClusterNodeCalculatedColor(d);
        d3.select(this).select("use").attr("fill", finalColor);
      } else if (nodeType === "Vertex") {
        d3.select(this).select("use").attr("fill", "var(--node-color)");
      }
    });
  } else if (
    window.HCGDrawer &&
    typeof window.HCGDrawer.updateNodeColoring === "function"
  ) {
    // Fallback to calling the full redraw function if the utility isn't ready
    window.HCGDrawer.updateNodeColoring();
  } else {
    // Fallback if drawer not ready
    d3.selectAll("g.node-cell")
      .selectAll("use")
      .attr("fill", "var(--node-color)");
  }
}

export function setupEdgeDisplayToggleListener() {
  const toggle = document.getElementById("edge-display-toggle");

  if (toggle) {
    toggle.addEventListener("change", () => {
      // Ensure HCGDrawer object exists
      if (window.HCGDrawer) {
        // 1. Update coloring for cluster nodes (mandatory)
        if (typeof window.HCGDrawer.updateNodeColoring === "function") {
          window.HCGDrawer.updateNodeColoring();
        }

        // 2. Update coloring for adjacency cells (assuming this exists)
        if (typeof window.HCGDrawer.updateAdjCellColoring === "function") {
          window.HCGDrawer.updateAdjCellColoring();
        }

        // 3. Redraw ALL legends to reflect the new Max/Ratio values
        if (typeof window.HCGDrawer.drawEdgeColorLegend === "function") {
          window.HCGDrawer.drawEdgeColorLegend();
        }
        if (typeof window.HCGDrawer.drawAdjCellColorLegend === "function") {
          window.HCGDrawer.drawAdjCellColorLegend();
        }
        // Redraw the new node cell legend (mandatory)
        if (typeof window.HCGDrawer.drawNodeCellColorLegend === "function") {
          window.HCGDrawer.drawNodeCellColorLegend();
        }
        if (typeof window.HCGDrawer.drawDirectedLegend === "function") {
          window.HCGDrawer.drawDirectedLegend();
        }
      }
    });
  }
}
