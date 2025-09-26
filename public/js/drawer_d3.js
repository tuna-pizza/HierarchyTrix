import { NodeType, Node, Edge, HierarchicallyClusteredGraph } from "./graph.js";
import { hsvToRgb } from "./utils.js";
import * as listeners from "./listeners.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const cellSize = 40;
const nodeColor = "black";
const cellboundaryColor = "darkgray";
const treecolor = "lightblue";
const edgeColor = "rgb(50, 125, 200)";
const arrayBoundaryWidth = "3";
const edgeWidth = "4";
const textSize = "20";
const smallTextSize = "12";
const textOffset = 2;
const vertexDistance = 80;
const clusterDistanceScalar = 1.5;

export class HierarchicallyClusteredGraphDrawer {
  constructor(H) {
    this.H = H;
    this.nodeOrder = null;
  }

  addOrderConstraints(orderString) {
    this.nodeOrder = [];
    let idOrder = orderString.split(" ");
    for (let i = 0; i < idOrder.length; i++) {
      this.nodeOrder.push(this.H.getNodeByID(idOrder[i]));
    }
  }

  defineSquareShape(defs) {
    defs
      .append("polygon")
      .attr("id", "squareShape")
      .attr(
        "points",
        `${-cellSize / 2},0 0,${cellSize / 2} ${cellSize / 2},0 0,${
          -cellSize / 2
        }`
      )
      .attr("stroke", cellboundaryColor)
      .attr("stroke-width", arrayBoundaryWidth);
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
    // Set coordinates and width for the cluster itself
    xCoordMap.set(cluster, offsetX);
    yCoordMap.set(cluster, offsetY);
    widthMap.set(cluster, cluster.getChildren().length * cellSize);

    // Sort children based on their calculated X-coordinate in the layer below
    const children = [...cluster.getChildren()].sort(
      (a, b) => xCoordMap.get(a) - xCoordMap.get(b)
    );

    // Calculate the starting X position for the first child, relative to the cluster's center
    const startX = -(children.length - 1) * 0.5 * cellSize;

    // Store the final global coordinates for each child node's representation in this cluster
    children.forEach((child, i) => {
      const childX = startX + i * cellSize;
      xCoordReferenceMap.set(child, offsetX + childX);
      yCoordReferenceMap.set(child, offsetY);
    });

    const clusterContainer = clusterGroup
      .append("g")
      .attr("class", "cluster")
      .attr("transform", `translate(${offsetX}, ${offsetY})`);

    // --- Draw child nodes using a data join ---
    const nodeCells = clusterContainer
      .append("g")
      .attr("class", "nodes")
      .selectAll("g.node-cell")
      .data(children, (d) => d.getID())
      .join("g")
      .attr("class", "node-cell")
      .attr("transform", (d, i) => `translate(${startX + i * cellSize}, 0)`);

    nodeCells
      .append("use")
      .attr("href", "#squareShape")
      .attr("fill", nodeColor);

    nodeCells
      .append("text")
      .attr("y", textOffset)
      .attr("fill", "white")
      .attr("font-size", textSize)
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "middle")
      .attr("pointer-events", "none")
      .text((d) => d.getID());

    nodeCells
      .on("mouseover", listeners.mouseEntersNodeCell)
      .on("mouseleave", listeners.mouseLeavesNodeCell);

    // --- Prepare data for the adjacency matrix ---
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

    // --- Draw adjacency matrix cells using a data join ---
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

    // Set color and text for each adjacency cell based on its data
    adjCells.each((d, i, nodes) => {
      const adjCell = d3.select(nodes[i]);
      const actualEdges = this.H.getNumberOfEdges(d.source, d.target);
      const potentialEdges =
        d.source.getLeaves().length * d.target.getLeaves().length;
      const connectivity =
        potentialEdges > 0 ? actualEdges / potentialEdges : 0;
      const mapValue = connectivity * 0.4;
      let [r, g, b] = hsvToRgb(175, 0.7, 0.95 - mapValue);

      if (connectivity === 0) {
        [r, g, b] = [255, 255, 255];
      }

      const cellColor = `rgb(${r},${g},${b})`;

      adjCell
        .append("use")
        .attr("href", "#squareShape")
        .attr("fill", cellColor);

      // Bind a richer data object to the group element for listeners to access the color and nodes
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
        .attr("fill", "black") // Black text for better contrast
        .attr("font-size", smallTextSize)
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text(`${actualEdges}/${potentialEdges}`);

      adjCell
        .on("mouseover", listeners.mouseEntersAdjCell)
        .on("mouseleave", listeners.mouseLeavesAdjCell);
    });
  }

  drawLinearLayout(
    svg,
    initialOffsetX,
    offsetY,
    xCoordMap,
    yCoordMap,
    widthMap
  ) {
    if (this.nodeOrder === null) {
      this.nodeOrder = this.H.getVertices();
    }

    // Pre-calculate positions for all vertices
    let currentX = initialOffsetX;
    this.nodeOrder.forEach((vertex) => {
      xCoordMap.set(vertex, currentX);
      yCoordMap.set(vertex, offsetY);
      widthMap.set(vertex, cellSize);
      currentX += vertexDistance;
    });

    // --- Draw edges using a data join ---
    svg
      .append("g")
      .attr("class", "linear-edges")
      .selectAll("path.edge")
      .data(this.H.getEdges())
      .join("path")
      .attr("class", "edge")
      .attr("d", (d) => {
        let x1 = xCoordMap.get(d.getSource());
        let x2 = xCoordMap.get(d.getTarget());
        if (x1 > x2) [x1, x2] = [x2, x1]; // Ensure x1 is the smaller coordinate
        const xDist = x2 - x1;
        return `M ${x1} ${offsetY} C ${x1} ${offsetY + xDist / 2}, ${x2} ${
          offsetY + xDist / 2
        }, ${x2} ${offsetY}`;
      })
      .attr("stroke", edgeColor)
      .attr("stroke-width", edgeWidth)
      .attr("fill", "none");

    // --- Draw nodes using a data join ---
    const nodeCells = svg
      .append("g")
      .attr("class", "linear-nodes")
      .selectAll("g.node-cell")
      .data(this.nodeOrder, (d) => d.getID()) // Key function for object constancy
      .join("g")
      .attr("class", "node-cell")
      .attr("transform", (d) => `translate(${xCoordMap.get(d)}, ${offsetY})`);

    nodeCells
      .append("use")
      .attr("href", "#squareShape")
      .attr("fill", nodeColor);

    nodeCells
      .append("text")
      .attr("y", textOffset)
      .attr("fill", "white")
      .attr("font-size", textSize)
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "middle")
      .attr("pointer-events", "none")
      .text((d) => d.getID());

    nodeCells
      .on("mouseover", listeners.mouseEntersNodeCell)
      .on("mouseleave", listeners.mouseLeavesNodeCell);
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
    for (const node of this.H.getNodes()) {
      if (node.getParent() !== null) {
        //
        const referenceX = xCoordReferenceMap.get(node); //
        const referenceY = yCoordReferenceMap.get(node); //
        const x = xCoordMap.get(node); //
        const y = yCoordMap.get(node); //
        const width = widthMap.get(node); //

        // Check if all coordinates are available before creating the path
        if (
          [referenceX, referenceY, x, y, width].every((v) => v !== undefined)
        ) {
          const topLeftX =
            referenceX - cellSize / 2 - parseInt(arrayBoundaryWidth, 10); //
          const topRightX =
            referenceX + cellSize / 2 + parseInt(arrayBoundaryWidth, 10); //
          const upperMiddleLeftX =
            referenceX - cellSize / 2 + 2.5 * parseInt(arrayBoundaryWidth, 10); //
          const upperMiddleRightX =
            referenceX + cellSize / 2 - 2.5 * parseInt(arrayBoundaryWidth, 10); //
          const topY = referenceY; //
          const bottomLeftX = x - width / 2 - parseInt(arrayBoundaryWidth, 10); //
          const bottomRightX = x + width / 2 + parseInt(arrayBoundaryWidth, 10); //
          const lowerMiddleLeftX = x - width / 3; //
          const lowerMiddleRightX = x + width / 3; //
          const bottomY = y; //
          const belowTopY = topY + 0.4 * clusterDistance; //
          const aboveBottomY = bottomY - 0.6 * clusterDistance; //

          const pathString = `M ${topLeftX} ${topY} C ${upperMiddleLeftX} ${belowTopY}, ${lowerMiddleLeftX} ${aboveBottomY}, ${bottomLeftX} ${bottomY} L ${bottomRightX} ${bottomY} C ${lowerMiddleRightX} ${aboveBottomY}, ${upperMiddleRightX} ${belowTopY}, ${topRightX} ${topY} L ${topLeftX} ${topY} Z`; //

          // 2. Push an object containing the node and its path string.
          pathData.push({
            node: node,
            path: pathString,
          });
        }
      }
    }

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
    const svg = d3
      .create("svg:svg")
      .attr("viewBox", "0 0 1920 1080")
      .attr("width", "1920")
      .attr("height", "1080");

    const defs = svg.append("defs");
    this.defineSquareShape(defs);

    const clusterLayers = this.H.getClusterLayers();
    const depth = clusterLayers.length;
    const clusterHeight = this.H.getMaxChildren() * cellSize;
    const clusterDistance = clusterHeight * clusterDistanceScalar;
    const initialOffsetX = cellSize / 2;
    const initialOffsetY = clusterHeight;

    // Maps to store calculated coordinates and sizes
    const xCoordMap = new Map();
    const yCoordMap = new Map();
    const widthMap = new Map();
    const xCoordReferenceMap = new Map(); // For child nodes within clusters
    const yCoordReferenceMap = new Map(); // For child nodes within clusters

    // --- Draw the bottom linear layout of leaf nodes ---
    this.drawLinearLayout(
      svg,
      initialOffsetX,
      initialOffsetY + depth * clusterDistance,
      xCoordMap,
      yCoordMap,
      widthMap
    );

    // --- Draw the hierarchical clusters from bottom to top ---
    const clustersContainer = svg
      .append("g")
      .attr("class", "clusters-container");
    for (let i = depth - 1; i >= 0; i--) {
      for (const cluster of clusterLayers.at(i)) {
        // Calculate the cluster's center X based on its children's positions
        let totalX = 0;
        for (const child of cluster.getChildren()) {
          totalX += xCoordMap.get(child);
        }
        const clusterX = totalX / cluster.getChildren().length;

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

    // --- Draw the inclusion bands connecting hierarchy levels ---
    this.drawClusterInclusions(
      svg,
      xCoordMap,
      yCoordMap,
      widthMap,
      xCoordReferenceMap,
      yCoordReferenceMap,
      clusterDistance
    );

    d3.select("body").append(() => svg.node());
  }
}
