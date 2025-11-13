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
let edgeWidth = 2;
const textSize = "18";
const smallTextSize = "12";
const textOffset = 2;
const vertexDistance = 60;
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

    this.edgeWeightThreshold = null;

    window.addEventListener("edgeWeightThresholdChange", (e) => {
      this.edgeWeightThreshold = e.detail.threshold;
      this.filterEdgesByWeight();
    });
  }

  hasNumericEdgeLabels() {
    const edges = this.H.getEdges();
    if (edges.length === 0) return false;

    let allNumeric = true;
    let minValue = Infinity;
    let maxValue = -Infinity;

    for (const edge of edges) {
      const attributeValue = edge.getWeight ? edge.getWeight() : "";
      if (
        attributeValue === "" ||
        attributeValue === null ||
        attributeValue === undefined
      ) {
        allNumeric = false;
        break;
      }

      const numValue = parseFloat(attributeValue); // Now parse the weight
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

    // The scale will vary the Lightness (L) component, keeping Hue (H=210) and Saturation (S=60%) constant.
    const hue = 210;
    const saturation = 60;

    // Define the range: from 90% Lightness (very light blue) to 49% Lightness (the requested dark blue).
    let lightColor = `hsl(${hue}, ${saturation}%, 90%)`; // Min value color
    const darkColor = `hsl(${hue}, ${saturation}%, 49%)`; // Max value color (matches edge-color)

    if (max - min == 1) {
      lightColor = `hsl(${hue}, ${saturation}%, 75%)`; // Min value color
    }

    // The scale will go from min value (light blue) to max value (dark blue)
    return d3
      .scaleLinear()
      .domain([min, max]) // Simple two-point domain
      .range([lightColor, darkColor]); // Simple two-point range

    // // Create color scale: dark green -> green -> orange -> dark orange -> red -> dark red
    // return d3
    //   .scaleLinear()
    //   .domain([
    //     min,
    //     min + (max - min) * 0.2,
    //     min + (max - min) * 0.4,
    //     min + (max - min) * 0.6,
    //     min + (max - min) * 0.8,
    //     max,
    //   ])
    //   .range([
    //     "#006400", // dark green
    //     "#00FF00", // green
    //     "#FFA500", // orange
    //     "#FF8C00", // dark orange
    //     "#FF0000", // red
    //     "#8B0000", // dark red
    //   ]);
  }

  computeEdgeColors() {
    const edges = this.H.getEdges();
    this.edgeColors = new Map();

    if (!this.hasNumericEdgeLabels()) {
      // Not numeric, use default colors
      const hue = 210;
      const saturation = 60;
      const mediumColor = `hsl(${hue}, ${saturation}%, 75%)`;
      edges.forEach((edge) => {
        this.edgeColors.set(edge, mediumColor);
        edge.edgeColor = mediumColor;
      });
      return;
    }

    if (this.edgeLabelStats && this.edgeLabelStats.isNumeric) {
      const { min, max } = this.edgeLabelStats;
      const filterContainer = document.getElementById("edge-weight-filter");
      const sliderEl = document.getElementById("edge-weight-slider");
      const valueLabel = document.getElementById("edge-weight-value");

      if (filterContainer && sliderEl && valueLabel) {
        // Show the filter controls
        filterContainer.style.display = "block";

        // Set slider bounds and initial value
        sliderEl.min = min;
        sliderEl.max = max;
        sliderEl.step = (max - min) / 100 || 1;
        sliderEl.value = min;
        valueLabel.textContent = min.toFixed(1);

        // Listen for user changes
        sliderEl.oninput = (e) => {
          const threshold = parseFloat(e.target.value);
          valueLabel.textContent = threshold.toFixed(1);
          window.dispatchEvent(
            new CustomEvent("edgeWeightThresholdChange", {
              detail: { threshold },
            })
          );
        };

        // Dispatch once initially to set up filtering
        window.dispatchEvent(
          new CustomEvent("edgeWeightThresholdChange", {
            detail: { threshold: min },
          })
        );
      } else {
        console.warn("Edge weight filter slider elements not found in DOM.");
      }
    }

    const colorScale = this.createNumericColorScale();
    if (!colorScale) return;

    // Compute and store color for each edge
    edges.forEach((edge) => {
      const attributeValue = edge.getWeight ? edge.getWeight() : "";
      const numValue = parseFloat(attributeValue); // Now parse the weight
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
        (idsB.has(srcId) && idsA.has(tgtId))
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
    yCoordReferenceMap,
    isLastLevel = false
  ) {
    const children = [...cluster.getChildren()].sort(
      (a, b) => xCoordMap.get(a) - xCoordMap.get(b)
    );

    const isDirected = this.H.getIsDirected();

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
      .attr("height", hitAreaHeight + 18)
      .attr("fill", "transparent")
      .attr("pointer-events", "all")
      .style("cursor", "pointer");

    // Add hover events for cluster statistics
    clusterHitArea
      .on("mouseover", (event) => {
        const stats = this.calculateClusterStatistics(cluster);
        const [x, y] = d3.pointer(event, document.body);
        this.showClusterStatsPopup(cluster, stats, x, y);

        clusterLabel
          .transition()
          .duration(200)
          .attr("fill", "var(--node-color)")
          .attr("font-size", window.currentLabelSize + 1 || 16);
      })
      .on("mouseout", () => {
        this.hideClusterStatsPopup();

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
        const src = children[i]; // Left node (s)
        const tgt = children[j]; // Right node (t)

        // Find directed edges: i (src) is the left node, j (tgt) is the right node
        const edge_s_to_t =
          allGraphEdges.find(
            (e) => e.getSource() === src && e.getTarget() === tgt
          ) || null;
        const edge_t_to_s =
          allGraphEdges.find(
            (e) => e.getSource() === tgt && e.getTarget() === src
          ) || null;

        // For non-directed/non-last-level cells, we still use a single 'matchingEdge' for label/color
        const matchingEdge = edge_s_to_t || edge_t_to_s; // Use either one

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
          matchingEdge: matchingEdge,
          edgeLabel,
          edgeColor,
          // Store directional edges and flags for triangle drawing
          edge_s_to_t: edge_s_to_t,
          edge_t_to_s: edge_t_to_s,
          isLastLevel: isLastLevel,
          isDirected: isDirected,
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
        d.source.getLeaves().length * d.target.getLeaves().length;

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

      d.isLastLevel = isLastLevel;
      d.isWeightColored = isLastLevel && d.matchingEdge;

      let cellColor;

      if (d.isWeightColored) {
        // Use the color pre-calculated from edge weight (HSL scale)
        cellColor = d.matchingEdge.edgeColor;
      } else {
        // Existing ratio/absolute coloring logic for other layers
        cellColor =
          colorValue === 0 ? "rgb(255,255,255)" : colorScale(colorValue);
      }

      const isDirectedAndLastLevel = d.isLastLevel && d.isDirected;
      const isEdgePresent =
        d.edge_s_to_t || d.edge_t_to_s || (d.matchingEdge && !d.isDirected);

      const halfCell = cellSize / 2;
      // Use an offset (1.5 is half the arrayBoundaryWidth, which is 3)
      // to shrink the filled triangles so they fit inside the cell's border,
      // preventing overlap with adjacent cell strokes.
      const triangleOffset = arrayBoundaryWidth / 2;

      if (isDirectedAndLastLevel) {
        // Clear the existing polygon if it was appended earlier in a loop (not in the provided snippet, but good practice)
        adjCell.selectAll("polygon").remove();

        // Always draw a white diamond first to ensure the cell background is filled
        // and the stroke (border) is created.
        adjCell
          .append("polygon")
          .attr(
            "points",
            `${-halfCell},0 0,${halfCell} ${halfCell},0 0,${-halfCell}`
          )
          .attr("stroke", cellboundaryColor)
          .attr("stroke-width", arrayBoundaryWidth)
          .attr("fill", "rgb(255,255,255)"); // White background

        if (isEdgePresent) {
          // Edge from s (left node) to t (right node)?
          if (d.edge_s_to_t) {
            // Right triangle (points towards t). Reduced size for fill to fit within the border
            adjCell
              .append("polygon")
              .attr(
                "points",
                // Top point pulled down: (0, -halfCell + offset)
                `0,${-halfCell + triangleOffset} ` +
                  // Right point pulled left: (halfCell - offset, 0)
                  `${halfCell - triangleOffset},0 ` +
                  // Bottom point pulled up: (0, halfCell - offset)
                  `0,${halfCell - triangleOffset}`
              )
              .attr("stroke-width", 0) // No extra stroke for the filled triangle
              .attr("fill", d.edge_s_to_t.edgeColor);
          }

          // Edge from t (right node) to s (left node)?
          if (d.edge_t_to_s) {
            // Left triangle (points towards s). Reduced size for fill
            adjCell
              .append("polygon")
              .attr(
                "points",
                // Top point pulled down: (0, -halfCell + offset)
                `0,${-halfCell + triangleOffset} ` +
                  // Left point pulled right: (-halfCell + offset, 0)
                  `${-halfCell + triangleOffset},0 ` +
                  // Bottom point pulled up: (0, halfCell - offset)
                  `0,${halfCell - triangleOffset}`
              )
              .attr("stroke-width", 0) // No extra stroke for the filled triangle
              .attr("fill", d.edge_t_to_s.edgeColor);
          }
        }
      } else {
        // Existing logic for drawing full diamond (undirected or non-last level)
        adjCell.select("polygon").remove(); // Remove potential existing polygon before re-drawing
        adjCell
          .append("polygon")
          .attr(
            "points",
            `${-halfCell},0 0,${halfCell} ${halfCell},0 0,${-halfCell}`
          )
          .attr("stroke", cellboundaryColor)
          .attr("stroke-width", arrayBoundaryWidth)
          .attr("fill", cellColor);
      }

      // Label depending on mode
      adjCell
        .append("text")
        .attr("y", textOffset)
        .attr("fill", (d) => {
          // If it's the bottommost layer, make the text transparent/invisible
          if (d.isLastLevel) {
            return "transparent";
          }
          // Otherwise, use the node color (as previously requested)
          return nodeColor;
        })
        .attr("font-size", smallTextSize)
        .attr("font-family", "var(--font-main)")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text((d) => {
          // Access the flag indicating if the graph has numeric edge weights
          const isNumeric =
            this.edgeLabelStats && this.edgeLabelStats.isNumeric;

          // Case 1: Bottom-level cell
          if (d.isLastLevel) {
            // Sub-Case 1a: Graph HAS numeric weights (use existing weight display logic)
            if (isNumeric) {
              const weight = d.matchingEdge
                ? d.matchingEdge.getWeight()
                : undefined;

              // Display "" for missing/null/numeric weight
              if (weight === undefined || weight === null || weight === 0) {
                return "";
              }

              // Format all other numeric weights to one decimal place
              return d3.format(".1f")(weight);
            }

            // Sub-Case 1b: Graph DOES NOT have numeric weights (User's request: Adjacency Matrix Binary 1/0)
            else {
              // Display "1" if an edge exists (d.matchingEdge is truthy), "0" otherwise.
              return "";
            }
          }

          // Case 2: Higher-level matrix cell (Fallback for all higher layers)
          else {
            // Fallback to ratio/absolute for higher layers
            const actualEdges = d.actualEdges;
            const potentialEdges = d.potentialEdges;
            const colorByAbsolute = this.edgeDisplayMode === "absolute";

            return colorByAbsolute
              ? `${actualEdges}`
              : `${actualEdges}/${potentialEdges}`;
          }
        });

      adjCells
        .on("mouseover", listeners.mouseEntersAdjCell)
        .on("mouseleave", listeners.mouseLeavesAdjCell);
    });
  }

  redrawAdjacencyCells() {
    d3.selectAll(".adjacency-cell").each((d, i, nodes) => {
      if (d.isLastLevel) {
        return;
      }

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
    //TODO: START COPYING HERE
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
          let topOfArrayOffset = Math.min(1.25 * cellSize, width / 2);
          let topOfArrayLeftX = x - topOfArrayOffset;
          let topOfArrayRightX = x + topOfArrayOffset;
          let lowerMiddleLeftX = topOfArrayLeftX; //
          let lowerMiddleRightX = topOfArrayRightX; //
          let belowTopY = topY + 0.4 * clusterDistance; //
          let currentBottomY = topY + clusterDistance;
          let currentTopY = topY;
          let aboveBottomY = currentBottomY - 0.6 * clusterDistance; //
          const verticalSpan = Math.abs(bottomY - topY) / clusterDistance;
          let currentBottomLeftX = lowerMiddleLeftX;
          let currentBottomRightX = lowerMiddleRightX;
          let leftPath = "";
          let rightPath = "";
          if (verticalSpan === 1) {
            currentBottomLeftX = bottomLeftX;
            currentBottomRightX = bottomRightX;
            lowerMiddleLeftX = topOfArrayLeftX;
            lowerMiddleRightX = topOfArrayRightX;
            let topOfArrayY = y - width / 2 - cellSize / 2;
            let belowTopOfArrayY = topOfArrayY + (0.2 * width) / 2;
            let aboveBottomOfArrayY = currentBottomY - (0.6 * width) / 2;
            belowTopY = topY + 0.5 * (clusterDistance - width / 2);
            aboveBottomY = topOfArrayY - 0.5 * (clusterDistance - width / 2);
            belowTopY = belowTopY;
            leftPath = `C ${upperMiddleLeftX} ${belowTopY}, ${lowerMiddleLeftX} ${aboveBottomY}, ${topOfArrayLeftX} ${topOfArrayY}
			C ${topOfArrayLeftX} ${belowTopOfArrayY}, ${currentBottomLeftX} ${aboveBottomOfArrayY}, ${currentBottomLeftX} ${currentBottomY}`;
            rightPath = `C ${currentBottomRightX} ${aboveBottomOfArrayY},${topOfArrayRightX} ${belowTopOfArrayY},${topOfArrayRightX} ${topOfArrayY}
			C ${lowerMiddleRightX} ${aboveBottomY}, ${upperMiddleRightX} ${belowTopY}, ${topRightX} ${currentTopY}`;
          } else {
            leftPath = `C ${upperMiddleLeftX} ${belowTopY}, ${lowerMiddleLeftX} ${aboveBottomY}, ${currentBottomLeftX} ${currentBottomY}`;
            rightPath = `C ${lowerMiddleRightX} ${aboveBottomY}, ${upperMiddleRightX} ${belowTopY}, ${topRightX} ${currentTopY}`;
          }
          for (let i = 1; i < verticalSpan; i++) {
            currentBottomY = currentBottomY + clusterDistance;
            currentTopY = currentTopY + clusterDistance;
            let belowTopY = currentTopY + 0.4 * clusterDistance; //
            let aboveBottomY = currentBottomY - 0.6 * clusterDistance; //
            if (verticalSpan === i + 1) {
              currentBottomLeftX = bottomLeftX;
              currentBottomRightX = bottomRightX;
              lowerMiddleLeftX = topOfArrayLeftX;
              lowerMiddleRightX = topOfArrayRightX;
              let topOfArrayY = y - width / 2 - cellSize / 2;
              let belowTopOfArrayY = topOfArrayY + (0.2 * width) / 2;
              let aboveBottomOfArrayY = currentBottomY - (0.6 * width) / 2;
              belowTopY = currentTopY + 0.5 * (clusterDistance - width / 2);
              aboveBottomY = topOfArrayY - 0.5 * (clusterDistance - width / 2);
              belowTopY = belowTopY;
              leftPath =
                leftPath +
                `C ${lowerMiddleLeftX} ${belowTopY}, ${lowerMiddleLeftX} ${aboveBottomY}, ${topOfArrayLeftX} ${topOfArrayY}
				C ${topOfArrayLeftX} ${belowTopOfArrayY}, ${currentBottomLeftX} ${aboveBottomOfArrayY}, ${currentBottomLeftX} ${currentBottomY}`;
              rightPath =
                `C ${currentBottomRightX} ${aboveBottomOfArrayY},${topOfArrayRightX} ${belowTopOfArrayY},${topOfArrayRightX} ${topOfArrayY}
				C ${lowerMiddleRightX} ${aboveBottomY}, ${lowerMiddleRightX} ${belowTopY}, ${lowerMiddleRightX} ${currentTopY}` +
                rightPath;
            } else {
              leftPath =
                leftPath +
                `\nC ${lowerMiddleLeftX} ${belowTopY}, ${lowerMiddleLeftX} ${aboveBottomY}, ${currentBottomLeftX} ${currentBottomY}`;
              rightPath =
                `C ${lowerMiddleRightX} ${aboveBottomY}, ${lowerMiddleRightX} ${belowTopY}, ${lowerMiddleRightX} ${currentTopY}\n` +
                rightPath;
            }
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
    }
    //TODO: END COPYING HERE
    // 3. Bind the array of objects. The second argument to .attr("d", ...) is now an accessor function.

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
      const isLastLevel = i === depth - 1;
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
          yCoordReferenceMap,
          isLastLevel
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
        let x1 = xCoordMap.get(d.getSource());
        let x2 = xCoordMap.get(d.getTarget());
        const y = yCoordMap.get(d.getSource());
        let sourceLeft = true;
        if (x1 === undefined || x2 === undefined || y === undefined) return "";
        if (x1 > x2) {
          let swap = x1;
          x1 = x2;
          x2 = swap;
          if (this.H.getIsDirected()) {
            sourceLeft = false;
          }
        }

        // Remove the logic that swaps x1/x2 to force left-to-right drawing.
        // This allows the path to be drawn from Source (x1) to Target (x2).

        // xDist is now the absolute distance between nodes, used for curve height
        const xDist = Math.abs(x2 - x1);

        // The midpoint must be correctly calculated as the average of the two x-coordinates.
        const x_mid = (x1 + x2) / 2.0;

        // maxDist calculation is fine, as it uses the absolute distance
        if (xDist > maxDist) maxDist = xDist;

        const curveHeight = xDist / 4;

        // Use original x1 and x2 coordinates for the path.
        if (!this.H.getIsDirected()) {
          let normalWidth = 1;
          return `M ${x1 - normalWidth} ${y + cellSize / 2 - normalWidth} C ${
            x1 - normalWidth
          } ${y + cellSize / 2 + curveHeight / 1.5 + normalWidth}, ${
            x1 + xDist / 4.0 - normalWidth / 2
          } ${y + cellSize / 2 + curveHeight + normalWidth}, ${
            x1 + xDist / 2.0
          } ${y + cellSize / 2 + curveHeight + normalWidth} 
			  C ${x2 - xDist / 4.0 + normalWidth / 2} ${
            y + cellSize / 2 + curveHeight + normalWidth
          }, ${x2 + normalWidth} ${
            y + cellSize / 2 + curveHeight / 1.5 + normalWidth
          }, ${x2 + normalWidth} ${y + cellSize / 2 - normalWidth}
			  L ${x2 - normalWidth} ${y + cellSize / 2 - normalWidth}
			  C ${x2 - normalWidth} ${
            y + cellSize / 2 + curveHeight / 1.5 - normalWidth
          }, ${x2 - xDist / 4.0 - normalWidth / 2} ${
            y + cellSize / 2 + curveHeight - normalWidth
          }, ${x1 + xDist / 2.0} ${
            y + cellSize / 2 + curveHeight - normalWidth
          } 
			  C ${x1 + xDist / 4.0 + normalWidth / 2} ${
            y + cellSize / 2 + curveHeight - normalWidth
          }, ${x1 + normalWidth} ${
            y + cellSize / 2 + curveHeight / 1.5 - normalWidth
          },${x1 + normalWidth} ${y + cellSize / 2 + normalWidth}
			  L ${x1 - normalWidth} ${y + cellSize / 2 - normalWidth} Z`;
        } else {
          let taperedWidth = 4;
          if (sourceLeft) {
            return `M ${x1 - taperedWidth} ${y + cellSize / 2 - taperedWidth} 
				C ${x1} ${y + cellSize / 2 + curveHeight / 1.5 + taperedWidth}, ${
              x1 + xDist / 4.0
            } ${y + cellSize / 2 + curveHeight + taperedWidth / 1.5}, ${
              x1 + xDist / 2.0
            } ${y + cellSize / 2 + curveHeight + taperedWidth / 2} 
			  C ${x2 - xDist / 4.0} ${
              y + cellSize / 2 + curveHeight + taperedWidth / 3.5
            }, ${x2} ${y + cellSize / 2 + curveHeight / 1.5}, ${x2} ${
              y + cellSize / 2 - taperedWidth
            }
			  C  ${x2} ${y + cellSize / 2 + curveHeight / 1.5}, ${x2 - xDist / 4.0} ${
              y + cellSize / 2 + curveHeight - taperedWidth / 3.5
            },${x1 + xDist / 2.0} ${
              y + cellSize / 2 + curveHeight - taperedWidth / 2
            }
				C  ${x1 + xDist / 4.0} ${
              y + cellSize / 2 + curveHeight - taperedWidth / 1.5
            } ${x1} ${y + cellSize / 2 + curveHeight / 1.5 - taperedWidth},${
              x1 + taperedWidth
            } ${y + cellSize / 2 - taperedWidth}
		        L ${x1 - taperedWidth} ${y + cellSize / 2 - taperedWidth} Z
			  `;
          } else {
            return `M ${x1} ${y + cellSize / 2 - taperedWidth} 
				C ${x1} ${y + cellSize / 2 + curveHeight / 1.5}, ${x1 + xDist / 4.0} ${
              y + cellSize / 2 + curveHeight + taperedWidth / 3.5
            }, ${x1 + xDist / 2.0} ${
              y + cellSize / 2 + curveHeight + taperedWidth / 2
            } 
			  C ${x2 - xDist / 4.0} ${
              y + cellSize / 2 + curveHeight + taperedWidth / 1.5
            }, ${x2} ${y + cellSize / 2 + curveHeight / 1.5 + taperedWidth}, ${
              x2 + taperedWidth
            } ${y + cellSize / 2 - taperedWidth}
			  L ${x2 - taperedWidth} ${y + cellSize / 2 - taperedWidth}
			  C  ${x2} ${y + cellSize / 2 + curveHeight / 1.5 - taperedWidth}, ${
              x2 - xDist / 4.0
            } ${y + cellSize / 2 + curveHeight - taperedWidth / 1.5},${
              x1 + xDist / 2.0
            } ${y + cellSize / 2 + curveHeight - taperedWidth / 2}
				C  ${x1 + xDist / 4.0} ${
              y + cellSize / 2 + curveHeight - taperedWidth / 3.5
            } ${x1} ${y + cellSize / 2 + curveHeight / 1.5},${x1} ${
              y + cellSize / 2 - taperedWidth
            }	         
			  `;
          }
        }
      })
      .attr("stroke", (d) => {
        const color = this.edgeColors
          ? this.edgeColors.get(d) || "var(--edge-color)"
          : "var(--edge-color)";
        return color;
      })
      .attr("stroke-width", edgeWidth)
      .attr("fill", (d) => {
        const color = this.edgeColors
          ? this.edgeColors.get(d) || "var(--edge-color)"
          : "var(--edge-color)";
        return color;
      })
      .attr("opacity", 1)
      .style("pointer-events", "visibleFill")
      .on("mouseover", (event, d) => {
        // Get the computed color for this edge
        const edgeColor = this.edgeColors ? this.edgeColors.get(d) : null;
        // Store it on the edge object temporarily for the listener
        d.edgeColor = edgeColor;

        listeners.mouseEntersEdge(
          event,
          d,
          this,
          xCoordMap,
          yCoordMap,
          edgeLabelsGroup,
          cellSize
        );
      })

      .on("mouseleave", (event) =>
        listeners.mouseLeavesEdge(event, edgeLabelsGroup)
      );

    this.filterEdgesByWeight();

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

    const maxArcHeight = maxDist / 3.4;
    const minRequiredHeight =
      linearLayoutY +
      maxArcHeight +
      document.getElementById("main-header-container").getBoundingClientRect()
        .height;
    const viewBoxHeight = minRequiredHeight + padding;

    // Calculate and display statistics
    const stats = this.calculateStatistics();
    this.updateStatisticsDisplay(stats);

    // Store SVG reference for zoom
    this.svg = svg;
    svg.attr("viewBox", `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
    d3.select("body").append(() => svg.node());

    // Setup zoom behavior
    this.setupZoomBehavior();

    this.drawEdgeColorLegend();
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

  drawEdgeColorLegend() {
    const container = d3.select("#edge-legend-container");
    container.html(""); // Clear previous content on redraw

    if (!this.edgeLabelStats || !this.edgeLabelStats.isNumeric) {
      return; // No legend if data is not numeric
    }

    const { min, max } = this.edgeLabelStats;

    // --- Legend Constants ---
    const containerWidth = container.node().clientWidth;
    const barWidth = containerWidth;
    const barHeight = 15;
    const formatValue = d3.format(".1f");
    // HSL components (matching your requested colorscale)
    const hue = 210;
    const saturation = 60;
    const gradientId = "edge-weight-gradient-html"; // Unique ID for the HTML-based SVG gradient

    // Define colors
    const lightColor = `hsl(${hue}, ${saturation}%, 90%)`;
    const darkColor = `hsl(${hue}, ${saturation}%, 49%)`;

    // --- 1. Title ---
    container
      .append("div")
      .style("font-size", "var(--font-size)")
      .style("margin-bottom", "4px")
      .style("color", "var(--color-secondary)")
      .style("font-family", "var(--font-main)")
      .text("Edge weight:");

    // --- 2. Create an SVG inside the HTML container for the color bar and gradient ---
    const svg = container
      .append("svg")
      .attr("width", barWidth)
      .attr("height", barHeight);

    const defs = svg.append("defs");

    // Define the linear gradient
    const linearGradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%");

    // Color stops
    linearGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", lightColor);

    linearGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", darkColor);

    // Color Bar Rectangle
    svg
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", barWidth)
      .attr("height", barHeight)
      .style("fill", `url(#${gradientId})`)
      .style("stroke", "var(--color-text-header)")
      .style("stroke-width", 1);

    // --- 3. Add Min/Max labels below the bar using HTML/D3 ---

    // Min/Max values container
    const valueContainer = container
      .append("div")
      .style("display", "flex")
      .style("justify-content", "space-between")
      .style("width", `${barWidth}px`)
      .style("font-size", "0.9rem")
      .style("font-weight", "normal")
      .style("color", "var(--color-secondary)")
      .style("font-family", "var(--font-main)");

    // Min Label (Left)
    valueContainer
      .append("span")
      .style("text-align", "left")
      .text(formatValue(min));

    // Max Label (Right)
    valueContainer
      .append("span")
      .style("text-align", "right")
      .text(formatValue(max));
  }

  filterEdgesByWeight() {
    if (!this.edgeLabelStats || !this.edgeLabelStats.isNumeric) return;

    const threshold = this.edgeWeightThreshold ?? this.edgeLabelStats.min;

    d3.selectAll(".linear-edges path").each((d, i, nodes) => {
      const edge = d3.select(nodes[i]).datum();
      if (!edge || !edge.getWeight) return;

      const weight = parseFloat(edge.getWeight());
      const visible = !isNaN(weight) && weight >= threshold;

      d3.select(nodes[i]).attr("display", visible ? null : "none");
    });
  }
}
