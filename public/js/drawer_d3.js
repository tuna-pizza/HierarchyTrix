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
const edgeWidth = "4";
const textSize = "20";
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
      .text((d) => d.getID());

    nodeCells
      .on("mouseover", listeners.mouseEntersNodeCell)
      .on("mouseleave", listeners.mouseLeavesNodeCell); // ADJACENCY CELLS

    const adjacencyData = [];
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        adjacencyData.push({
          source: children[i],
          target: children[j],
          x1: startX + i * cellSize,
          x2: startX + j * cellSize,
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

    const colorScale = d3
      .scaleLinear()
      .domain([0, 1])
      .range([resolvedAdjColorLow, resolvedAdjColorHigh]);

    adjCells.each((d, i, nodes) => {
      const adjCell = d3.select(nodes[i]);
      const actualEdges = this.H.getNumberOfEdges(d.source, d.target);
      const potentialEdges =
        d.source.getLeaves().length * d.target.getLeaves().length;
      const connectivity =
        potentialEdges > 0 ? actualEdges / potentialEdges : 0;
      let cellColor =
        connectivity === 0 ? "rgb(255,255,255)" : colorScale(connectivity);

      adjCell
        .append("use")
        .attr("href", "#diamondShape")
        .attr("fill", cellColor);

      adjCell.datum({
        color: cellColor,
        source: d.source,
        target: d.target,
        actualEdges: actualEdges,
        potentialEdges: potentialEdges,
      });

      adjCell
        .append("text")
        .attr("y", textOffset)
        .attr("fill", "black")
        .attr("font-size", smallTextSize)
        .attr("font-family", "var(--font-main)")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text(`${actualEdges}/${potentialEdges}`);

      adjCells
        .on("mouseover", listeners.mouseEntersAdjCell)
        .on("mouseleave", listeners.mouseLeavesAdjCell);
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
    const initialOffsetY = ((1 + maxChildren) / 2.0) * cellSize;

    // Linear layout dimensions
    const lastNodeCenterX = initialOffsetX + (numVertices - 1) * vertexDistance;
    const minRequiredWidth = lastNodeCenterX + cellSize / 2;
    const maxHorizontalDistance = (numVertices - 1) * vertexDistance;
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
    //const clusterLayers = this.H.getClusterLayers();
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
        return `M ${x1} ${y} Q ${x1} ${y + xDist / 2.5}, ${x1 + xDist / 2.0} ${
          y + xDist / 2.5
        } Q ${x2} ${y + xDist / 2.5}, ${x2} ${y}`;
      })
      .attr("stroke", edgeColor)
      .attr("stroke-width", edgeWidth)
      .attr("fill", "none")
      .on("mouseover", listeners.mouseEntersEdge)
      .on("mouseleave", listeners.mouseLeavesEdge);

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

    const maxArcHeight = maxDist / 2.5;
    const minRequiredHeight = linearLayoutY + maxArcHeight;
    const viewBoxHeight = minRequiredHeight + padding;

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
      .scaleExtent([0.1, 4]) // Min and max zoom levels
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
