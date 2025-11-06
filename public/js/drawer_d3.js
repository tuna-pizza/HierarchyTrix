import { NodeType, Node, Edge, HierarchicallyClusteredGraph } from "./graph.js";
import { hsvToRgb } from "./utils.js";
import * as listeners from "./listeners.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const cellSize = 40;
const nodeColor = "var(--node-color)";
const cellboundaryColor = "var(--cell-boundary-color)";
const treecolor = "var(--tree-color)";
const edgeColor = "var(--edge-color)";
const arrayBoundaryWidth = "3";
const edgeWidth = 3;
const textSize = "18";
const smallTextSize = "12";
const textOffset = 2;
const vertexDistance = 60; // Reduced from 80 to 60
const clusterDistanceScalar = 1;

export class HierarchicallyClusteredGraphDrawer {
  constructor(H) {
    this.H = H;
    this.nodeOrder = null;
    this.svg = null;
    this.zoomGroup = null;
    this.d3zoom = null;
    this.currentTransform = null;
    this.clusterStatsPopup = null;
    this.edgeLabelStats = null;
    this.edgeColors = null;

    // --- Edge display mode toggle support ---
    this.edgeDisplayMode = "ratio";
    window.addEventListener("edgeDisplayModeChange", (e) => {
      this.edgeDisplayMode = e.detail.mode;
      this.redrawAdjacencyCells();
    });

    window.addEventListener("labelSizeChange", (e) => {
      const size = e.detail.size || 15;

      // Update all text labels in the visualization
      d3.selectAll(".leaf-label, .edge-label, .cluster-label").attr(
        "font-size",
        size
      );
    });
  }

  hasNumericEdgeLabels() {
    const edges = this.H.getEdges();
    if (edges.length === 0) return false;

    let allNumeric = true;
    let minValue = Infinity;
    let maxValue = -Infinity;

    for (const edge of edges) {
      const label = edge.getLabel ? edge.getLabel() : "";
      if (label === "" || label === null || label === undefined) {
        allNumeric = false;
        break;
      }

      const numValue = parseFloat(label);
      if (isNaN(numValue)) {
        allNumeric = false;
        break;
      }

      minValue = Math.min(minValue, numValue);
      maxValue = Math.max(maxValue, numValue);
    }

    if (allNumeric) {
      this.edgeLabelStats = {
        isNumeric: true,
        min: minValue,
        max: maxValue,
      };
      return true;
    } else {
      this.edgeLabelStats = { isNumeric: false };
      return false;
    }
  }

  createNumericColorScale() {
    if (!this.edgeLabelStats || !this.edgeLabelStats.isNumeric) {
      return null;
    }

    const { min, max } = this.edgeLabelStats;

    // Create color scale: dark green -> green -> orange -> dark orange -> red -> dark red
    return d3
      .scaleLinear()
      .domain([
        min,
        min + (max - min) * 0.2,
        min + (max - min) * 0.4,
        min + (max - min) * 0.6,
        min + (max - min) * 0.8,
        max,
      ])
      .range([
        "#006400", // dark green
        "#00FF00", // green
        "#FFA500", // orange
        "#FF8C00", // dark orange
        "#FF0000", // red
        "#8B0000", // dark red
      ]);
  }

  computeEdgeColors() {
    const edges = this.H.getEdges();
    this.edgeColors = new Map();

    if (!this.hasNumericEdgeLabels()) {
      // Not numeric, use default colors
      edges.forEach((edge) => {
        const color = "var(--edge-color)";
        this.edgeColors.set(edge, color);
        edge.edgeColor = color;
      });
      return;
    }

    const colorScale = this.createNumericColorScale();
    if (!colorScale) return;

    // Compute and store color for each edge
    edges.forEach((edge) => {
      const label = edge.getLabel ? edge.getLabel() : "";
      const numValue = parseFloat(label);
      if (!isNaN(numValue)) {
        const color = colorScale(numValue);
        this.edgeColors.set(edge, color);
        edge.edgeColor = color;
      } else {
        const color = "var(--edge-color)";
        this.edgeColors.set(edge, color);
        edge.edgeColor = color;
      }
    });
  }

  addOrderConstraints(orderString) {
    this.nodeOrder = [];
    let idOrder = orderString.split(" ");
    for (let i = 0; i < idOrder.length; i++) {
      this.nodeOrder.push(this.H.getNodeByID(idOrder[i]));
    }
  }

  defineNodeShapes(defs) {
    defs
      .append("polygon")
      .attr("id", "diamondShape")
      .attr(
        "points",
        `${-cellSize / 2},0 0,${cellSize / 2} ${cellSize / 2},0 0,${
          -cellSize / 2
        }`
      )
      .attr("stroke", cellboundaryColor)
      .attr("stroke-width", arrayBoundaryWidth);
  }

  isLeaf(node) {
    return !node.getChildren || node.getChildren().length === 0;
  }

  calculateStatistics() {
    const stats = {
      totalTreeEdges: 0,
      visibleEdges: 0,
      internalClusterEdges: 0,
      totalClusters: 0,
      totalLeaves: 0,
    };

    // Count total tree edges (cluster hierarchy relationships)
    // These are the parent-child relationships in the cluster tree
    const clusterLayers = this.H.getClusterLayers(false);
    stats.totalClusters = clusterLayers.flat().length;

    // Calculate tree edges: each non-root cluster has one parent relationship
    // Total tree edges = total clusters - 1 (since root cluster has no parent)
    stats.totalTreeEdges = Math.max(0, stats.totalClusters - 1);

    // Count total leaves (nodes without children)
    stats.totalLeaves = this.H.getVertices().length;

    // Count all graph edges (the actual connections between nodes)
    const allEdges = this.H.getEdges();

    // Identify last-level clusters for filtering
    let filteredEdges = allEdges;
    if (clusterLayers.length > 0) {
      const lastLevelClusters = clusterLayers.at(-1);
      const clusterMap = new Map();

      // Map each leaf to its cluster ID
      lastLevelClusters.forEach((cluster) => {
        cluster.getChildren().forEach((child) => {
          if (!child.getChildren || child.getChildren().length === 0) {
            clusterMap.set(child.getID(), cluster.getID());
          }
        });
      });

      // Separate visible edges from internal cluster edges
      filteredEdges = allEdges.filter((edge) => {
        const srcCluster = clusterMap.get(edge.getSource().getID());
        const tgtCluster = clusterMap.get(edge.getTarget().getID());
        return !(srcCluster && tgtCluster && srcCluster === tgtCluster);
      });

      stats.visibleEdges = filteredEdges.length;
      stats.internalClusterEdges = allEdges.length - filteredEdges.length;
    } else {
      // If no clusters, all edges are visible
      stats.visibleEdges = allEdges.length;
      stats.internalClusterEdges = 0;
    }

    return stats;
  }

  calculateClusterStatistics(cluster) {
    const stats = {
      clusterId: cluster.getID(),
      childClusters: 0,
      directChildren: 0,
      totalLeavesInCluster: 0,
      internalEdges: 0,
      externalEdges: 0,
      totalDescendants: 0,
    };

    // Get all leaves in this cluster
    const leavesInCluster = cluster.getLeaves();
    stats.totalLeavesInCluster = leavesInCluster.length;

    // Count direct children and child clusters
    const children = cluster.getChildren();
    stats.directChildren = children.length;

    // Count child clusters (non-leaf children)
    stats.childClusters = children.filter(
      (child) => child.getChildren && child.getChildren().length > 0
    ).length;

    // Count total descendants (all nodes in this cluster's subtree)
    const countDescendants = (node) => {
      let count = 1; // count self
      if (node.getChildren && node.getChildren().length > 0) {
        node.getChildren().forEach((child) => {
          count += countDescendants(child);
        });
      }
      return count;
    };
    stats.totalDescendants = countDescendants(cluster) - 1; // exclude self

    // Calculate edges within this cluster and edges going out
    const allEdges = this.H.getEdges();
    const leafIdsInCluster = new Set(
      leavesInCluster.map((leaf) => leaf.getID())
    );

    allEdges.forEach((edge) => {
      const sourceId = edge.getSource().getID();
      const targetId = edge.getTarget().getID();

      const sourceInCluster = leafIdsInCluster.has(sourceId);
      const targetInCluster = leafIdsInCluster.has(targetId);

      if (sourceInCluster && targetInCluster) {
        stats.internalEdges++;
      } else if (sourceInCluster || targetInCluster) {
        stats.externalEdges++;
      }
    });

    return stats;
  }

  updateStatisticsDisplay(stats) {
    // Update the stats panel if it exists
    if (typeof window.updateStatsPanel === "function") {
      window.updateStatsPanel(stats);
    }

    // Also log to console for debugging
    console.log("Graph Statistics:", stats);
  }

  showClusterStatsPopup(cluster, stats, x, y) {
    // Create popup if it doesn't exist
    if (!this.clusterStatsPopup) {
      this.clusterStatsPopup = d3
        .select("body")
        .append("div")
        .attr("id", "cluster-stats-popup")
        .style("position", "absolute")
        .style("z-index", "1000")
        .style("background", "var(--color-background-medium)")
        .style("border", "2px solid var(--color-secondary)")
        .style("border-radius", "8px")
        .style("padding", "15px")
        .style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)")
        .style("font-family", "var(--font-main)")
        .style("font-size", "0.9rem")
        .style("color", "var(--color-text-header)")
        .style("pointer-events", "none")
        .style("opacity", 0)
        .style("transition", "opacity 0.2s");
    }

    // Update popup content and position
    const popupContent = `
        <div style="margin-bottom: 8px;"><strong>Cluster: ${stats.clusterId}</strong></div>
        <div style="margin-left: 10px;">
            <div style="margin-bottom: 4px;">• Children: ${stats.directChildren}</div>
            <div style="margin-bottom: 4px;">• Child Clusters: ${stats.childClusters}</div>
            <div style="margin-bottom: 4px;">• Total Leaves: ${stats.totalLeavesInCluster}</div>
            <div style="margin-bottom: 4px;">• Total Nodes: ${stats.totalDescendants}</div>
            <div style="margin-bottom: 4px;">• Internal Edges: ${stats.internalEdges}</div>
            <div style="margin-bottom: 4px;">• External Edges: ${stats.externalEdges}</div>
        </div>
    `;

    this.clusterStatsPopup
      .html(popupContent)
      .style("left", x + 15 + "px")
      .style("top", y - 10 + "px")
      .style("opacity", 1);
  }

  hideClusterStatsPopup() {
    if (this.clusterStatsPopup) {
      this.clusterStatsPopup.style("opacity", 0);
    }
  }

  // --- Count all edges between two clusters' subtrees ---
  countAllEdgesBetweenClusters(clusterA, clusterB) {
    const leavesA = clusterA.getLeaves();
    const leavesB = clusterB.getLeaves();

    // Create quick lookup sets for IDs
    const idsA = new Set(leavesA.map((leaf) => leaf.getID()));
    const idsB = new Set(leavesB.map((leaf) => leaf.getID()));

    let count = 0;
    for (const edge of this.H.getEdges()) {
      const srcId = edge.getSource().getID();
      const tgtId = edge.getTarget().getID();
      if (
        (idsA.has(srcId) && idsB.has(tgtId)) ||
        (idsB.has(srcId) && idsA.has(tgtId)) ||
        (idsA.has(srcId) && idsA.has(tgtId)) ||
        (idsB.has(srcId) && idsB.has(tgtId))
      ) {
        count++;
      }
    }
    return count;
  }

  drawCluster(
    cluster,
    offsetX,
    offsetY,
    clusterGroup,
    xCoordMap,
    yCoordMap,
    widthMap,
    xCoordReferenceMap,
    yCoordReferenceMap
  ) {
    const children = [...cluster.getChildren()].sort(
      (a, b) => xCoordMap.get(a) - xCoordMap.get(b)
    );

    xCoordMap.set(cluster, offsetX);
    yCoordMap.set(cluster, offsetY);
    widthMap.set(cluster, children.length * cellSize);

    const startX = -(children.length - 1) * 0.5 * cellSize;

    children.forEach((child, i) => {
      const childX = startX + i * cellSize;
      xCoordReferenceMap.set(child, offsetX + childX);
      yCoordReferenceMap.set(child, offsetY);
    });

    const clusterContainer = clusterGroup
      .append("g")
      .attr("class", "cluster")
      .attr("transform", `translate(${offsetX}, ${offsetY})`);

    // Compute how high the matrix extends
    const matrixHeight = (children.length - 1) * (cellSize / 2);

    // Add cluster label at the top tip of the matrix
    const clusterLabel = clusterContainer
      .append("text")
      .attr("class", "cluster-label")
      .attr("x", 0) // centered horizontally
      .attr("y", -matrixHeight - cellSize * 0.75) // above the topmost adjacency cell
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "baseline")
      .attr("font-family", "var(--font-main)")
      .attr("font-size", window.currentLabelSize || 15)
      .attr("font-weight", "bold")
      .attr("fill", "var(--node-color)")
      .attr("pointer-events", "none")
      .text(cluster.getID());

    const labelTopY = -matrixHeight - cellSize * 0.75; // Y position of the label text
    const hitAreaTopY = labelTopY - cellSize * 0.25; // Extend hit area slightly above the label
    const hitAreaBottomY = cellSize / 2; // Bottom of the diamond cells
    const hitAreaHeight = hitAreaBottomY - hitAreaTopY;

    // Add invisible hit area for the entire cluster for hover events
    const clusterHitArea = clusterContainer
      .append("rect")
      .attr("class", "cluster-hit-area")
      .attr("x", startX - cellSize / 2 - 5)
      .attr("y", hitAreaTopY - 15)
      .attr("width", children.length * cellSize + 10)
      .attr("height", hitAreaHeight + 10)
      .attr("fill", "transparent")
      .attr("pointer-events", "all")
      .style("cursor", "pointer");

    // Add hover events for cluster statistics
    clusterHitArea
      .on("mouseover", (event) => {
        const stats = this.calculateClusterStatistics(cluster);
        const [x, y] = d3.pointer(event, document.body);
        this.showClusterStatsPopup(cluster, stats, x, y);

        // Highlight the cluster and label
        clusterContainer
          .selectAll(".nodes use")
          .transition()
          .duration(200)
          .attr("fill", "var(--color-primary)");

        clusterLabel
          .transition()
          .duration(200)
          .attr("fill", "var(--node-color)")
          .attr("font-size", window.currentLabelSize + 1 || 16);
      })
      .on("mouseout", () => {
        this.hideClusterStatsPopup();

        // Remove highlight
        clusterContainer
          .selectAll(".nodes use")
          .transition()
          .duration(200)
          .attr("fill", nodeColor);

        clusterLabel
          .transition()
          .duration(200)
          .attr("fill", "var(--node-color)")
          .attr("font-size", window.currentLabelSize || 15);
      })
      .on("mousemove", (event) => {
        const [x, y] = d3.pointer(event, document.body);
        if (this.clusterStatsPopup) {
          this.clusterStatsPopup
            .style("left", x + 15 + "px")
            .style("top", y - 10 + "px");
        }
      });

    const nodeCells = clusterContainer
      .append("g")
      .attr("class", "nodes")
      .selectAll("g.node-cell")
      .data(children, (d) => d.getID())
      .join("g")
      .attr("class", "node-cell")
      .attr("data-id", (d) => d.getID())
      .attr("transform", (d, i) => `translate(${startX + i * cellSize}, 0)`); // DIAMOND SHAPE FOR ALL NODES

    nodeCells
      .append("use")
      .attr("href", "#diamondShape")
      .attr("fill", nodeColor);

    nodeCells
      .append("text")
      .attr("y", textOffset)
      .attr("fill", "white")
      .attr("font-size", textSize)
      .attr("font-family", "var(--font-main)")
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "middle")
      .attr("pointer-events", "none")
      .text((d) => {
        const id = d.getID();
        if (isNaN(id)) {
          return id.charAt(0);
        }
        return id;
      });

    // Build adjacencyData and attach the underlying Edge's label/color if any
    const adjacencyData = [];
    // Pull current edges once for performance
    const allGraphEdges = this.H.getEdges ? this.H.getEdges() : [];

    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const src = children[i];
        const tgt = children[j];

        // Try to find a concrete Edge object that links these two nodes
        // Accept either direction (src->tgt or tgt->src)
        const matchingEdge =
          allGraphEdges.find(
            (e) =>
              (e.getSource &&
                e.getTarget &&
                e.getSource() === src &&
                e.getTarget() === tgt) ||
              (e.getSource &&
                e.getTarget &&
                e.getSource() === tgt &&
                e.getTarget() === src)
          ) || null;

        const edgeLabel =
          matchingEdge && matchingEdge.getLabel ? matchingEdge.getLabel() : "";
        const edgeColor =
          matchingEdge &&
          (matchingEdge.color ||
            (matchingEdge.getColor && matchingEdge.getColor()))
            ? matchingEdge.color ||
              (matchingEdge.getColor && matchingEdge.getColor())
            : null;

        adjacencyData.push({
          source: src,
          target: tgt,
          x1: startX + i * cellSize,
          x2: startX + j * cellSize,
          // attach the matched edge info (may be empty string/null if no single edge exists)
          edgeLabel,
          edgeColor,
          matchingEdge, // optional: keeps a reference if you want it later
        });
      }
    }

    const adjCells = clusterContainer
      .append("g")
      .attr("class", "adjacency")
      .selectAll("g.adjacency-cell")
      .data(adjacencyData)
      .join("g")
      .attr("class", "adjacency-cell")
      .attr("transform", (d) => {
        const xDist = d.x2 - d.x1;
        const x = d.x1 + xDist / 2;
        const y = -xDist / 2;
        return `translate(${x}, ${y})`;
      });

    const bodyElement = d3.select("body").node();
    const computedStyle = getComputedStyle(bodyElement);
    const resolvedAdjColorLow = computedStyle
      .getPropertyValue("--adj-color-low")
      .trim();
    const resolvedAdjColorHigh = computedStyle
      .getPropertyValue("--adj-color-high")
      .trim();

    adjCells.each((d, i, nodes) => {
      const adjCell = d3.select(nodes[i]);
      const actualEdges = this.countAllEdgesBetweenClusters(d.source, d.target);
      const potentialEdges =
        d.source.getLeaves().length * d.target.getLeaves().length +
        (d.source.getLeaves().length * (d.source.getLeaves().length - 1)) / 2 +
        (d.target.getLeaves().length * (d.target.getLeaves().length - 1)) / 2;

      d.actualEdges = actualEdges;
      d.potentialEdges = potentialEdges;

      const colorByAbsolute = this.edgeDisplayMode === "absolute";

      // Compute color value
      let colorValue = colorByAbsolute
        ? actualEdges
        : potentialEdges > 0
        ? actualEdges / potentialEdges
        : 0;

      let colorScale;
      if (colorByAbsolute) {
        const maxEdges = d3.max(adjacencyData, (d) =>
          this.H.getNumberOfEdges(d.source, d.target)
        );
        colorScale = d3
          .scaleLinear()
          .domain([0, maxEdges])
          .range([resolvedAdjColorLow, resolvedAdjColorHigh]);
      } else {
        colorScale = d3
          .scaleLinear()
          .domain([0, 1])
          .range([resolvedAdjColorLow, resolvedAdjColorHigh]);
      }

      let cellColor =
        colorValue === 0 ? "rgb(255,255,255)" : colorScale(colorValue);

      adjCell
        .append("polygon")
        .attr(
          "points",
          `${-cellSize / 2},0 0,${cellSize / 2} ${cellSize / 2},0 0,${
            -cellSize / 2
          }`
        )
        .attr("stroke", cellboundaryColor)
        .attr("stroke-width", arrayBoundaryWidth)
        .attr("fill", cellColor);

      // Label depending on mode
      adjCell
        .append("text")
        .attr("y", textOffset)
        .attr("fill", "black")
        .attr("font-size", smallTextSize)
        .attr("font-family", "var(--font-main)")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text(
          colorByAbsolute
            ? `${actualEdges}`
            : `${actualEdges}/${potentialEdges}`
        );

      adjCells
        .on("mouseover", listeners.mouseEntersAdjCell)
        .on("mouseleave", listeners.mouseLeavesAdjCell);
    });
  }

  redrawAdjacencyCells() {
    d3.selectAll(".adjacency-cell").each((d, i, nodes) => {
      const adjCell = d3.select(nodes[i]);
      const actualEdges = d.actualEdges;
      const potentialEdges = d.potentialEdges;

      const colorByAbsolute = this.edgeDisplayMode === "absolute";
      const value = colorByAbsolute
        ? actualEdges
        : potentialEdges > 0
        ? actualEdges / potentialEdges
        : 0;

      const computedStyle = getComputedStyle(document.body);
      const resolvedAdjColorLow = computedStyle
        .getPropertyValue("--adj-color-low")
        .trim();
      const resolvedAdjColorHigh = computedStyle
        .getPropertyValue("--adj-color-high")
        .trim();
      const colorScale = d3
        .scaleLinear()
        .domain(
          colorByAbsolute
            ? [
                0,
                d3.max(
                  d3.selectAll(".adjacency-cell").data(),
                  (c) => c.actualEdges
                ),
              ]
            : [0, 1]
        )
        .range([resolvedAdjColorLow, resolvedAdjColorHigh]);

      adjCell
        .select("polygon")
        .attr("fill", value === 0 ? "rgb(255,255,255)" : colorScale(value));

      adjCell
        .select("text")
        .text(
          colorByAbsolute
            ? `${actualEdges}`
            : `${actualEdges}/${potentialEdges}`
        );
    });
  }

  drawLinearLayout(
    initialOffsetX,
    offsetY,
    xCoordMap,
    yCoordMap,
    widthMap,
    finalClusterNodePositions = null
  ) {
    if (this.nodeOrder === null) {
      this.nodeOrder = this.H.getVertices();
    }

    let currentX = initialOffsetX;
    const leafPositions = new Map(); // Get the filtered leaves (last-level cluster leaves)

    const leavesToAlign = new Set(this.getLeavesInLastLevelClusters());

    this.nodeOrder.forEach((vertex) => {
      if (
        finalClusterNodePositions &&
        finalClusterNodePositions.has(vertex.getID())
      ) {
        leafPositions.set(
          vertex,
          finalClusterNodePositions.get(vertex.getID())
        );
      } else {
        leafPositions.set(vertex, currentX);
        currentX += vertexDistance;
      }
    }); // Update coordinates for all leaves

    this.nodeOrder.forEach((vertex) => {
      xCoordMap.set(vertex, leafPositions.get(vertex)); // Align filtered leaves with their cluster (if applicable)

      if (leavesToAlign.has(vertex)) {
        const parent = vertex.getParent();
        if (parent) {
          // Use parent's Y-coordinate if available, otherwise fallback to offsetY
          yCoordMap.set(vertex, yCoordMap.get(parent) || offsetY);
        } else {
          yCoordMap.set(vertex, offsetY);
        }
      } else {
        yCoordMap.set(vertex, offsetY);
      }

      widthMap.set(vertex, cellSize);
    });
  }

  getLeavesInLastLevelClusters() {
    const clusterLayers = this.H.getClusterLayers(false);
    const depth = clusterLayers.length;
    if (depth === 0) return [];

    const lastLevelClusters = clusterLayers[depth - 1];
    const leaves = [];

    lastLevelClusters.forEach((cluster) => {
      cluster.getChildren().forEach((child) => {
        if (!child.getChildren || child.getChildren().length === 0) {
          // leaf check
          leaves.push({ leaf: child, cluster: cluster });
          console.log(
            `Leaf ID: ${child.getID()} in cluster ID: ${cluster.getID()}`
          );
        }
      });
    });

    return leaves.map((x) => x.leaf); // return only the leaf nodes
  }

  drawClusterInclusions(
    svg,
    xCoordMap,
    yCoordMap,
    widthMap,
    xCoordReferenceMap,
    yCoordReferenceMap,
    clusterDistance
  ) {
    // 1. Create an array to hold rich data objects, not just strings.
    const pathData = [];
    const leavesToSkip = new Set(this.getLeavesInLastLevelClusters());
    for (const node of this.H.getNodes()) {
      if (node.getParent() !== null && !leavesToSkip.has(node)) {
        //
        const referenceX = xCoordReferenceMap.get(node); //
        const referenceY = yCoordReferenceMap.get(node); //
        const x = xCoordMap.get(node); //
        const y = yCoordMap.get(node); //
        const width = widthMap.get(node); // // Check if all coordinates are available before creating the path

        if (
          [referenceX, referenceY, x, y, width].every((v) => v !== undefined)
        ) {
          const topLeftX =
            referenceX - cellSize / 2 - parseInt(arrayBoundaryWidth, 10); //
          const topRightX =
            referenceX + cellSize / 2 + parseInt(arrayBoundaryWidth, 10); //
          const topY = referenceY; //
          const bottomLeftX = x - width / 2 - parseInt(arrayBoundaryWidth, 10); //
          const bottomRightX = x + width / 2 + parseInt(arrayBoundaryWidth, 10); //
          const bottomY = y; //
          const upperMiddleLeftX =
            referenceX - cellSize / 2 + 2.5 * parseInt(arrayBoundaryWidth, 10); //
          const upperMiddleRightX =
            referenceX + cellSize / 2 - 2.5 * parseInt(arrayBoundaryWidth, 10); //
          const lowerMiddleLeftX = x - width / 3; //
          const lowerMiddleRightX = x + width / 3; //
          const belowTopY = topY + 0.4 * clusterDistance; //
          let currentBottomY = topY + clusterDistance;
          let currentTopY = topY;
          const aboveBottomY = currentBottomY - 0.6 * clusterDistance; //
          const verticalSpan = Math.abs(bottomY - topY) / clusterDistance;
          let currentBottomLeftX = lowerMiddleLeftX;
          if (verticalSpan === 1) {
            currentBottomLeftX = bottomLeftX;
          }
          let leftPath = `C ${upperMiddleLeftX} ${belowTopY}, ${lowerMiddleLeftX} ${aboveBottomY}, ${currentBottomLeftX} ${currentBottomY}`;
          let rightPath = `C ${lowerMiddleRightX} ${aboveBottomY}, ${upperMiddleRightX} ${belowTopY}, ${topRightX} ${currentTopY}`;
          for (let i = 1; i < verticalSpan; i++) {
            currentBottomY = currentBottomY + clusterDistance;
            currentTopY = currentTopY + clusterDistance;
            const belowTopY = currentTopY + 0.4 * clusterDistance; //
            const aboveBottomY = currentBottomY - 0.6 * clusterDistance; //
            if (verticalSpan === i + 1) {
              currentBottomLeftX = bottomLeftX;
            }
            leftPath =
              leftPath +
              `\nC ${lowerMiddleLeftX} ${belowTopY}, ${lowerMiddleLeftX} ${aboveBottomY}, ${currentBottomLeftX} ${currentBottomY}`;
            rightPath =
              `C ${lowerMiddleRightX} ${aboveBottomY}, ${lowerMiddleRightX} ${belowTopY}, ${lowerMiddleRightX} ${currentTopY}\n` +
              rightPath;
          } // FIX: Removed the trailing newline and indentation before the final Z

          const pathString =
            `M ${topLeftX} ${topY}` +
            leftPath +
            `L ${bottomRightX} ${bottomY}` +
            rightPath +
            `L ${topLeftX} ${topY} Z`; // 2. Push an object containing the node and its path string.

          pathData.push({
            node: node,
            path: pathString,
          });
        }
      }
    } // 3. Bind the array of objects. The second argument to .attr("d", ...) is now an accessor function.

    svg
      .append("g")
      .attr("class", "cluster-inclusions")
      .lower() // Move this group to the background
      .selectAll("path.inclusion")
      .data(pathData)
      .join("path")
      .attr("class", "inclusion")
      .attr("d", (d) => d.path) // Access the 'path' property from the bound object
      .attr("stroke", "none") //
      .attr("fill", treecolor); //
  }

  // ----------------------------------------------------------------------
  // CORRECTED: draw function
  // ----------------------------------------------------------------------
  draw() {
    // Determine the necessary dimensions
    if (this.nodeOrder === null) {
      this.nodeOrder = this.H.getVertices();
    }

    this.computeEdgeColors();

    const numVertices = this.nodeOrder.length;
    const clusterLayers = this.H.getClusterLayers(false);

    let maxChildren = 0;
    for (let cluster of clusterLayers[0]) {
      if (cluster.getChildren().length > maxChildren) {
        maxChildren = cluster.getChildren().length;
      }
    }

    const depth = clusterLayers.length;
    const clusterHeight = this.H.getMaxChildren() * cellSize;
    const clusterDistance = clusterHeight * clusterDistanceScalar;

    // Initial offsets
    const initialOffsetX = cellSize;
    const initialOffsetY = ((1 + maxChildren) / 2.0) * cellSize + 20;

    // Linear layout dimensions
    const lastNodeCenterX = initialOffsetX + (numVertices - 1) * vertexDistance;
    const minRequiredWidth = lastNodeCenterX + cellSize / 2;
    const linearLayoutY = initialOffsetY + (depth - 1) * clusterDistance;
    const padding = 80;
    const viewBoxWidth = minRequiredWidth + padding;

    const svg = d3
      .create("svg:svg")
      .style("width", "100%")
      .style("max-height", "100vh")
      .style("display", "block");

    // Create zoom group
    this.zoomGroup = svg.append("g").attr("class", "zoom-group");

    // Define node shapes
    const defs = this.zoomGroup.append("defs");
    this.defineNodeShapes(defs);

    // Maps to store coordinates
    const xCoordMap = new Map();
    const yCoordMap = new Map();
    const widthMap = new Map();
    const xCoordReferenceMap = new Map();
    const yCoordReferenceMap = new Map();

    // 1. Calculate Initial Linear Layout (Sets initial spaced-out X, and correct final Y)
    this.drawLinearLayout(
      initialOffsetX,
      linearLayoutY,
      xCoordMap,
      yCoordMap,
      widthMap
    );

    // 2. Draw Hierarchical Clusters (Calculates and sets X/Y for clusters and xCoordReferenceMap for cells)
    const clustersContainer = this.zoomGroup
      .append("g")
      .attr("class", "clusters-container");

    for (let i = depth - 1; i >= 0; i--) {
      for (const cluster of clusterLayers.at(i)) {
        const children = cluster.getChildren();
        // Calculate cluster center X based on children's spaced-out X coordinates
        const clusterX =
          children.reduce((sum, child) => sum + xCoordMap.get(child), 0) /
          children.length;
        this.drawCluster(
          cluster,
          clusterX,
          initialOffsetY + i * clusterDistance,
          clustersContainer,
          xCoordMap,
          yCoordMap,
          widthMap,
          xCoordReferenceMap,
          yCoordReferenceMap
        );
      }
    }

    // 3. ALIGN LEAVES
    const leavesToAlign = new Set(this.getLeavesInLastLevelClusters());

    this.H.getVertices().forEach((leaf) => {
      // ONLY align leaves that are explicitly part of a last-level cluster
      if (leavesToAlign.has(leaf)) {
        const refX = xCoordReferenceMap.get(leaf);
        const clusterY = yCoordMap.get(leaf.getParent());

        if (refX !== undefined && clusterY !== undefined) {
          // Overwrite the linear X (vertexDistance) with the cluster cell X (cellSize)
          xCoordMap.set(leaf, refX);

          // Re-confirm the Y coordinate is the cluster's Y (linearLayoutY)
          yCoordMap.set(leaf, clusterY);
        }
      }
    });

    // 4. FINAL DRAWING BLOCK (Edges and Nodes use the now-correctly-aligned coordinates)

    // --- DRAW EDGES ---

    this.zoomGroup.select("g.linear-edges").remove();
    const edgesGroup = this.zoomGroup.append("g").attr("class", "linear-edges");

    // === FILTER OUT EDGES INSIDE SAME LAST-LEVEL CLUSTER ===
    let filteredEdges = this.H.getEdges(); // default: all edges

    if (clusterLayers.length > 0) {
      const lastLevelClusters = clusterLayers.at(-1);
      const clusterMap = new Map();

      // Map each leaf to its cluster ID
      lastLevelClusters.forEach((cluster) => {
        cluster.getChildren().forEach((child) => {
          if (!child.getChildren || child.getChildren().length === 0) {
            clusterMap.set(child.getID(), cluster.getID());
          }
        });
      });

      // Filter edges: remove only those within same cluster
      filteredEdges = this.H.getEdges().filter((edge) => {
        const srcCluster = clusterMap.get(edge.getSource().getID());
        const tgtCluster = clusterMap.get(edge.getTarget().getID());
        return !(srcCluster && tgtCluster && srcCluster === tgtCluster);
      });
    }

    let maxDist = 0;

    // Create edge labels group
    this.zoomGroup.select("g.edge-labels").remove();
    const edgeLabelsGroup = this.zoomGroup
      .append("g")
      .attr("class", "edge-labels");

    // === DRAW FILTERED EDGES ===
    edgesGroup
      .selectAll("path.edge")
      .data(filteredEdges)
      .join("path")
      .attr("class", "edge")
      .attr("d", (d) => {
        // Use the finalized, aligned coordinates from the map
        let x1 = xCoordMap.get(d.getSource());
        let x2 = xCoordMap.get(d.getTarget());
        let y = yCoordMap.get(d.getSource());

        if (x1 === undefined || x2 === undefined || y === undefined) return "";

        let tempX1 = x1;
        let tempX2 = x2;
        if (tempX1 > tempX2) [tempX1, tempX2] = [tempX2, tempX1];

        if (x1 > x2) {
          let swap = x1;
          x1 = x2;
          x2 = swap;
        }

        const xDist = tempX2 - tempX1;
        if (xDist > maxDist) maxDist = xDist;
        // Draw a cubic Bézier curve
        return `M ${x1} ${y} Q ${x1} ${y + xDist / 3}, ${x1 + xDist / 2.0} ${
          y + xDist / 3
        } Q ${x2} ${y + xDist / 3}, ${x2} ${y}`;
      })
      .attr("stroke", (d) => {
        const color = this.edgeColors
          ? this.edgeColors.get(d) || "var(--edge-color)"
          : "var(--edge-color)";
        console.log(
          "Drawing edge - Label:",
          d.getLabel ? d.getLabel() : "",
          "Color:",
          color,
          "Has edgeColor:",
          d.edgeColor
        );
        return color;
      })
      .attr("stroke-width", edgeWidth)
      .attr("fill", "none")
      .on("mouseover", (event, d) => {
        // Get the computed color for this edge
        const edgeColor = this.edgeColors ? this.edgeColors.get(d) : null;
        // Store it on the edge object temporarily for the listener
        d.edgeColor = edgeColor;

        listeners.mouseEntersEdge(
          event,
          d,
          xCoordMap,
          yCoordMap,
          edgeLabelsGroup
        );
      })

      .on("mouseleave", (event) =>
        listeners.mouseLeavesEdge(event, edgeLabelsGroup)
      );

    // --- DRAW LEAF NODES ---
    this.zoomGroup.select("g.linear-nodes").remove();

    const nodeCells = this.zoomGroup
      .append("g")
      .attr("class", "linear-nodes")
      .selectAll("g.node-cell")
      .data(this.nodeOrder, (d) => d.getID())
      .join("g")
      .attr("class", "node-cell")
      .attr("data-id", (d) => d.getID())
      .attr("transform", (d) => {
        // Use the finalized coordinates from the map
        const finalX = xCoordMap.get(d);
        const finalY = yCoordMap.get(d);
        return `translate(${finalX}, ${finalY})`;
      });

    nodeCells
      .append("use")
      .attr("href", "#diamondShape")
      .attr("fill", nodeColor);

    nodeCells
      .append("text")
      .attr("y", textOffset)
      .attr("fill", "white")
      .attr("font-size", textSize)
      .attr("font-family", "var(--font-main)")
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "middle")
      .attr("pointer-events", "none")
      .text((d) => d.getID());

    nodeCells
      .on("mouseover", listeners.mouseEntersNodeCell)
      .on("mouseleave", listeners.mouseLeavesNodeCell);

    // 5. Draw Cluster Inclusions
    this.drawClusterInclusions(
      this.zoomGroup,
      xCoordMap, // Contains the correctly aligned X
      yCoordMap,
      widthMap,
      xCoordReferenceMap,
      yCoordReferenceMap,
      clusterDistance
    );

    // 6. DRAW LABELS (AFTER EVERYTHING ELSE TO APPEAR ON TOP)
    this.zoomGroup.select("g.leaf-labels").remove();
    const labelGroup = this.zoomGroup.append("g").attr("class", "leaf-labels");

    const lastLevelLeaves = this.getLeavesInLastLevelClusters();

    lastLevelLeaves.forEach((leaf) => {
      if (!leaf.customLabel) return;

      const refX = xCoordReferenceMap.get(leaf);
      const refY = yCoordReferenceMap.get(leaf);
      if (refX === undefined || refY === undefined) return;

      const groupX = refX;
      const groupY = refY + cellSize / 2 + 4;
      const padding = 1;
      const rotation = -45;

      // Create container (translate only; we rotate later)
      const labelContainer = labelGroup
        .append("g")
        .attr("class", "label-container")
        .attr("transform", `translate(${groupX}, ${groupY})`);

      // Add text
      const textEl = labelContainer
        .append("text")
        .attr("class", "leaf-label")
        .attr("x", 0)
        .attr("y", 0)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", window.currentLabelSize || 15)
        .attr("font-family", "var(--font-main)")
        .attr("font-weight", "bold")
        .attr("pointer-events", "none")
        .style("opacity", 0.9)
        .text(leaf.customLabel);

      (document.fonts?.ready ?? Promise.resolve()).then(() => {
        requestAnimationFrame(() => {
          const node = textEl.node();
          const bbox = node.getBBox();

          // Because text-anchor=end, bbox.x is negative and bbox.width positive.
          const rectX = bbox.x - padding;
          const rectY = bbox.y - padding;
          const rectWidth = bbox.width + padding * 2;
          const rectHeight = bbox.height + padding;

          // Insert the rect behind the text
          labelContainer
            .insert("rect", "text")
            .attr("class", "label-background")
            .attr("x", rectX)
            .attr("y", rectY + padding)
            .attr("width", rectWidth)
            .attr("height", rectHeight)
            .attr("rx", 2)
            .attr("ry", 2)
            .attr("fill", "white")
            .attr("opacity", 0.7)
            .attr("pointer-events", "none");

          // Finally, rotate the group so text + rect rotate together
          labelContainer.attr(
            "transform",
            `translate(${groupX}, ${groupY}) rotate(${rotation})`
          );
        });
      });
    });

    const maxArcHeight = maxDist / 3;
    const minRequiredHeight = linearLayoutY + maxArcHeight;
    const viewBoxHeight = minRequiredHeight + padding;

    // Calculate and display statistics
    const stats = this.calculateStatistics();
    this.updateStatisticsDisplay(stats);

    // Store SVG reference for zoom
    this.svg = svg;
    svg.attr(
      "viewBox",
      `0 0 ${viewBoxWidth} ${
        viewBoxHeight +
        document.getElementById("main-header-container").getBoundingClientRect()
          .height
      }`
    );
    d3.select("body").append(() => svg.node());

    // Setup zoom behavior
    this.setupZoomBehavior();
  }

  // === ZOOM METHODS ===
  setupZoomBehavior() {
    if (!this.svg) return; // Store the initial transform for reset
    this.initialTransform = d3.zoomIdentity;
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 8]) // Min and max zoom levels
      .on("zoom", (event) => {
        this.zoomGroup.attr("transform", event.transform);
        this.currentTransform = event.transform; // Store current transform
      });
    this.svg.call(zoom); // Store the zoom behavior for programmatic control
    this.d3zoom = zoom;
  }

  zoomIn() {
    if (!this.svg || !this.d3zoom) return; // Get current transform or use identity if none
    const currentTransform = this.currentTransform || d3.zoomIdentity;
    const newScale = Math.min(4, currentTransform.k * 1.2); // Apply zoom with transition
    this.svg.transition().duration(250).call(this.d3zoom.scaleTo, newScale);
  }

  zoomOut() {
    if (!this.svg || !this.d3zoom) return; // Get current transform or use identity if none
    const currentTransform = this.currentTransform || d3.zoomIdentity;
    const newScale = Math.max(0.1, currentTransform.k / 1.2); // Apply zoom with transition
    this.svg.transition().duration(250).call(this.d3zoom.scaleTo, newScale);
  }

  zoomReset() {
    if (!this.svg || !this.d3zoom) return;
    console.log("Resetting zoom to 100%"); // Reset to identity transform (scale=1, translate=0,0)
    this.svg
      .transition()
      .duration(250)
      .call(this.d3zoom.transform, d3.zoomIdentity);
  }
}
