const svgNS = "http://www.w3.org/2000/svg";
const cellSize = 40;
const nodeColor = "black";
const cellboundaryColor = "darkgray";
const edgeColor = "rgb(50, 125, 200)";
const arrayBoundaryWidth = "3";
const edgeWidth = "4";
const textSize = "20";
const textOffset = 2
const vertexDistance = 80;
const clusterDistanceScalar = 1.5;

function hsvToRgb(h, s, v) 
{
	let c = v * s;               // chroma
	let x = c * (1 - Math.abs((h / 60) % 2 - 1));
	let m = v - c;
	let r = 0, g = 0, b = 0;

	if (0 <= h && h < 60) { r = c; g = x; b = 0; }
	else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
	else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
	else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
	else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
	else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

	// convert to 0–255 range
	r = Math.round((r + m) * 255);
	g = Math.round((g + m) * 255);
	b = Math.round((b + m) * 255);

	return [r, g, b];
}

const NodeType =
{
	Cluster: "Cluster",
	Vertex: "Vertex"
}
class Node
{
	constructor(id,parentNode,type)
	{
		this.id = id;
		this.parentNode = parentNode;
		this.type = type;
		this.children = [];
		if (parentNode != null)
		{
			parentNode.addChild(this);
		}
	}
	addChild(child)
	{
		this.children.push(child);
	}
	getChildren()
	{
		return this.children;
	}
	getNodeType()
	{
		return this.type;
	}
	getID()
	{
		return this.id;
	}
	getParent()
	{
		return this.parentNode;
	}
	getLeaves()
	{
		let res = [];
		if (this.type === NodeType.Vertex)
		{
			res.push(this);
		}
		else
		{
			for (let child of this.children)
			{
				for (let leaf of child.getLeaves())
				{
					res.push(leaf);
				}
			}
		}
		return res;
	}
}
class Edge
{
	constructor(source,target)
	{
		this.source = source;
		this.target = target;
	}
	getSource()
	{
		return this.source;
	}
	getTarget()
	{
		return this.target;
	}
}

class HierarchicallyClusteredGraphDrawer
{
	constructor(H)
	{
		this.H = H;
		this.nodeOrder = null;
	}
	addOrderConstraints(orderString)
	{
		//TODO: Include output from Annika and Marialena
		this.nodeOrder = [];
		let idOrder = orderString.split(" ");
		for (let i = 0; i < idOrder.length; i++)
		{
			this.nodeOrder.push(this.H.getNodeByID(idOrder[i]));
		}
	}
	drawSquare(x,y)
	{
		const square = document.createElementNS(svgNS, "polygon");
		square.setAttribute("points", "" + (x-cellSize/2) + "," + y + " " + x + "," + (y+cellSize/2) + " " + (x+cellSize/2) + "," + y + " " + x + "," + (y-cellSize/2));
		//square.setAttribute("transform", "rotate(-45 " + cellSize/2 + " " + cellSize/2 + ")");
		square.setAttribute("x", x);    // top-left corner
		square.setAttribute("y", y);
		square.setAttribute("stroke", cellboundaryColor);	
		square.setAttribute("stroke-width", arrayBoundaryWidth);	
		return square;
	}
	defineSquareShape(svg,defs) 
	{	
		const square = document.createElementNS(svgNS, "polygon");
		square.setAttribute("id", "squareShape");
		square.setAttribute("points",`${-cellSize/2},0 0,${cellSize/2} ${cellSize/2},0 0,${-cellSize/2}`);
		square.setAttribute("stroke", cellboundaryColor);
		square.setAttribute("stroke-width", arrayBoundaryWidth);
		defs.appendChild(square);
	}
	drawNode(id,x,y,svg)
	{
		const label = document.createElementNS(svgNS, "text");
		label.setAttribute("x", x);          // x position
		label.setAttribute("y", y+textOffset);          // y position
		label.setAttribute("fill", "white");  // text color
		label.setAttribute("font-size", textSize); 
		label.setAttribute("text-anchor", "middle");          // center horizontally
		label.setAttribute("alignment-baseline", "middle");   // center vertically	
		label.textContent = id;   
		//let square = this.drawSquare(x,y);
		//square.setAttribute("fill", nodeColor);
		let square = document.createElementNS(svgNS, "use");
		square.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#squareShape");
		square.setAttribute("x", x);
		square.setAttribute("y", y);
		square.setAttribute("fill", nodeColor);
		svg.appendChild(square);
		svg.appendChild(label);
	}
	drawCluster(cluster,offsetX,offsetY,svg,xCoordMap,yCoordMap,widthMap,xCoordReferenceMap,yCoordReferenceMap)
	{
		let numberOfChildren = cluster.getChildren().length;
		let x = offsetX - (cluster.getChildren().length-1)*0.5*cellSize;
		xCoordMap.set(cluster,offsetX);
		yCoordMap.set(cluster,offsetY);
		console.log(numberOfChildren*cellSize);
		widthMap.set(cluster,numberOfChildren*cellSize);
		let children = [];
		let unsortedChildren = cluster.getChildren();
		while (unsortedChildren.length > 0)
		{
			let nextChild = unsortedChildren.at(0);
			let lowestX = xCoordMap.get(nextChild);
			for (let i = 1; i < unsortedChildren.length; i++)
			{
				let potentialChild = unsortedChildren.at(i);
				let potentialX = xCoordMap.get(potentialChild);
				if (potentialX < lowestX)
				{
					lowestX = potentialX;
					nextChild = potentialChild;
				}
			}
			children.push(nextChild);
			unsortedChildren = unsortedChildren.filter(child => child !== nextChild);
		}
		for (let child of children)
		{
			this.drawNode(child.id,x,offsetY,svg);
			xCoordReferenceMap.set(child,x);
			yCoordReferenceMap.set(child,offsetY);
			x = x + cellSize;
		}
		for (let child1 of cluster.getChildren())
		{
			for (let child2 of cluster.getChildren())
			{
				let x1 = xCoordReferenceMap.get(child1);
				let x2 = xCoordReferenceMap.get(child2);
				if (x1 < x2)
				{
					let potentialEdges = child1.getLeaves().length*child2.getLeaves().length;
					let actualEdges = this.H.getNumberOfEdges(child1,child2);	
					let xDist = x2 - x1;
					this.drawClusterEdge(actualEdges/potentialEdges,x1+xDist/2,offsetY-xDist/2,svg);
				}
			}
		}
	}
	drawClusterEdge(connectivity,x,y,svg)
	{
		//let square = this.drawSquare(x,y);
		let square = document.createElementNS(svgNS, "use");
		square.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#squareShape");
		square.setAttribute("x", x);
		square.setAttribute("y", y);
		let mapValue = connectivity*0.4;
		let [r, g, b] = hsvToRgb(175, 0.7, 0.95-mapValue);
		if (connectivity === 0)
		{
			r = 255;
			g = 255;
			b = 255;
		}
		square.setAttribute("fill", "rgb("+ r +"," + g + "," +  b + ")");
		svg.appendChild(square);
	}
	drawLinearLayout(offsetX,offsetY,svg,xCoordMap,yCoordMap,widthMap)
	{
		const nodes = document.createElementNS(svgNS, "g");
		if (this.nodeOrder === null)
		{
			this.nodeOrder = [];
			for (let vertex of this.H.getVertices())
			{
				this.nodeOrder.push(vertex);
			}
		}
		console.log(this.nodeOrder);
		for (let vertex of this.nodeOrder)
		{
			this.drawNode(vertex.id,offsetX,offsetY,nodes);
			xCoordMap.set(vertex,offsetX);
			yCoordMap.set(vertex,offsetY);
			widthMap.set(vertex,cellSize);
			offsetX += vertexDistance;
		}
		for (let edge of this.H.getEdges())
		{
			let x1 = xCoordMap.get(edge.getSource());
			let x2 = xCoordMap.get(edge.getTarget());
			if (x1 > x2)
			{
				let swap = x1;
				x1 = x2;
				x2 = swap;
			}
			let path = this.drawEdge(x1,x2,offsetY,svg);
			svg.appendChild(path);
		}
		svg.appendChild(nodes);
	}
	drawClusterInclusions(svg,xCoordMap,yCoordMap,widthMap,xCoordReferenceMap,yCoordReferenceMap,clusterDistance)
	{
		for (let node of this.H.getNodes())
		{
			if (node.getParent() !== null)
			{
				const referenceX = xCoordReferenceMap.get(node);
				const referenceY = yCoordReferenceMap.get(node);
				const topLeftX = referenceX - cellSize/2;
				const topRightX = referenceX + cellSize/2;
				const topY = referenceY;
				const x = xCoordMap.get(node);
				const y = yCoordMap.get(node);
				const width = widthMap.get(node);
				const bottomLeftX = x - width/2;
				const bottomRightX = x + width/2;
				const bottomY = y;
				const belowTopY = topY + clusterDistance/2;
				const aboveBottomY = bottomY - clusterDistance/2;
				//console.log(node);
				//console.log(width);
				const path = document.createElementNS(svgNS, "path");
				path.setAttribute(
				  "d",
				  `M ${topLeftX} ${topY} ` +                     // Move to P0
				  `C ${bottomLeftX} ${belowTopY}, ${bottomLeftX} ${aboveBottomY}, ${bottomLeftX} ${bottomY} ` + // Bezier to P1
				  `L ${bottomRightX} ${bottomY} ` +                     // Line to P2
				  `C ${bottomRightX} ${aboveBottomY}, ${bottomRightX} ${belowTopY}, ${topRightX} ${topY} ` + // Bezier to P3
				  `L ${topLeftX} ${topY} Z`                      // Line back to P0 and close
				);

				path.setAttribute("stroke", "none");
				path.setAttribute("fill", "lightblue");
				svg.appendChild(path);
			}
		}
	}
	drawEdge(x1,x2,y,svg)
	{
		const path = document.createElementNS(svgNS, "path");
		let xDist = x2-x1;
		// Start at (50,150), end at (350,150), control points (150,50) and (250,250)
		path.setAttribute("d", "M " + x1 + " " + y + " C " + x1 + " " + (y + xDist/2) + ", " + x2 + " " + (y + xDist/2) + ", " + x2 + "  " + y);

		// Style
		path.setAttribute("stroke", edgeColor);
		path.setAttribute("stroke-width", edgeWidth);
		path.setAttribute("fill", "none");
		return path;
	}
	draw()
	{
		const svg = document.createElementNS(svgNS, "svg");
		const defs = document.createElementNS(svgNS, "defs");
		this.defineSquareShape(svg,defs);
		svg.appendChild(defs);
		svg.setAttribute("viewBox", "0 0 1920 1080");
		svg.setAttribute("width", "1920");
		svg.setAttribute("height", "1080");
		let clusterLayers = this.H.getClusterLayers();
		let depth = clusterLayers.length;
		let clusterHeight = this.H.getMaxChildren()*cellSize;
		let clusterDistance = clusterHeight*clusterDistanceScalar;
		let offsetX = cellSize/2;
		let offsetY = clusterHeight;
		let xCoordMap = new Map(); 
		let yCoordMap = new Map();
		let widthMap = new Map();
		let xCoordReferenceMap = new Map();
		let yCoordReferenceMap = new Map();
		const linearLayoutGroup = document.createElementNS(svgNS, "g");
		this.drawLinearLayout(offsetX,offsetY+depth*clusterDistance,linearLayoutGroup,xCoordMap,yCoordMap,widthMap);
		const clusterGroup = document.createElementNS(svgNS, "g");
		for (let i = depth-1; i >= 0; i--)
		{
			for (let cluster of clusterLayers.at(i))
			{
				let x = 0;
				for (let child of cluster.getChildren())
				{
					x = x + xCoordMap.get(child);
				}
				x = x/cluster.getChildren().length;
				xCoordMap.set(cluster,x);
				this.drawCluster(cluster,x,offsetY+i*clusterDistance,clusterGroup,xCoordMap,yCoordMap,widthMap,xCoordReferenceMap,yCoordReferenceMap);
				offsetX = offsetX + cluster.children.length*cellSize + cellSize+2;
			}
		}
		this.drawClusterInclusions(svg,xCoordMap,yCoordMap,widthMap,xCoordReferenceMap,yCoordReferenceMap,clusterDistance)
		svg.appendChild(linearLayoutGroup);
		svg.appendChild(clusterGroup);
		document.body.appendChild(svg);
	}
}

class HierarchicallyClusteredGraph
{
	constructor()
	{
		this.nodes = [];
		this.edges = [];
	}
	getNumberOfEdges(node1,node2)
	{
		let myLeaves = node1.getLeaves();
		let otherLeaves = node2.getLeaves();
		let res = 0;
		for (let edge of this.edges)
		{
			if (myLeaves.includes(edge.getSource()) && otherLeaves.includes(edge.getTarget()))
			{
				res++;
			}
			if (otherLeaves.includes(edge.getSource()) && myLeaves.includes(edge.getTarget()))
			{
				res++;
			}
		}
		return res;
	}
	getEdges()
	{
		return this.edges;
	}
	getNodes()
	{
		return this.nodes;
	}
	getNodeByID(id)
	{
		for (let node of this.nodes)
		{
			if (node.getID() === id)
			{
				return node;
			}
		}
		return null;
	}
	getVertices()
	{
		let vertices = [];
		for (let node of this.nodes)
		{
			if (node.getNodeType() === NodeType.Vertex)
			{
				vertices.push(node);
			}
		}
		return vertices;
	}
	getClusterLayers()
	{
		let clusterLayers = [];
		let nextLayer = [];
		for (let cluster of this.getClusters())
		{
			if (cluster.getParent() === null)
			{
				nextLayer.push(cluster);
			}
		}
		while (nextLayer.length > 0)
		{
			let currentLayer = nextLayer;
			clusterLayers.push(nextLayer);
			nextLayer = [];
			for (let cluster of currentLayer)
			{
				for (let child of cluster.getChildren())
				{
					if (child.getNodeType() === NodeType.Cluster)
					{
						nextLayer.push(child);
					}
				}
			}
		}
		console.log(clusterLayers);
		return clusterLayers;
	}
	getMaxChildren()
	{
		let res = 0;
		for (let cluster of this.getClusters())
		{
			if (cluster.getChildren().length > res)
			{
				res = cluster.getChildren().length;
			}
		}
		return res;
	}
	getClusters()
	{
		let clusters = [];
		//console.log(this.nodes);
		//console.log(this.nodes.length);
		for (let i = 0; i < this.nodes.length; i++)
		{
			//console.log("THIS"); // now node is the actual object
			let node = this.getNodes().at(i);
			//console.log(node);
			if (node.getNodeType() === NodeType.Cluster) 
			{
				clusters.push(node);
			}
		}
		//console.log(clusters);
		return clusters;
	}
	async readFromJSON(path)
	{
		try 
		{
			const response = await fetch("/api/data"); // calls Node.js endpoint
			const data = await response.json();
			const queue = [];
			const nodeMap = new Map();
			// enqueue root nodes (no parent)
			for (const node of data.nodes) 
			{
				if (node.parent === null) 
				{
					let type = NodeType.Vertex;
					if (node.type === 'cluster')
					{
						type = NodeType.Cluster;
					}
					let vertex = new Node(node.id,null,type)
					nodeMap.set(node.id,vertex);
					this.nodes.push(vertex);
					queue.push(node);
				}
			}
			// BFS loop
			while (queue.length > 0) 
			{
				const current = queue.shift();

				// enqueue children of the current node
				for (const node of data.nodes) {
				  if (node.parent === current.id) 
				  {
					let type = NodeType.Vertex;
					if (node.type === 'cluster')
					{
						type = NodeType.Cluster;
					}
					let vertex = new Node(node.id,nodeMap.get(node.parent),type);
					nodeMap.set(node.id,vertex);
					this.nodes.push(vertex);
					queue.push(node);
				  }
				}
			}
			for (const edge of data.edges)
			{
				this.edges.push(new Edge(nodeMap.get(edge.source),nodeMap.get(edge.target)));
			}
			//console.log(data);
		} 
		catch (err) 	
		{
			console.error("Error fetching data:", err);
		}
		console.log(this);
	}
}
async function main() 
{
    let H = new HierarchicallyClusteredGraph();
    await H.readFromJSON("./sample.json"); // wait for JSON to load
    let HD = new HierarchicallyClusteredGraphDrawer(H);
	HD.addOrderConstraints("5 8 7 6 4 9 2 3 1");
    HD.draw(); // now nodes are loaded, getClusters() will return the correct clusters
}

main();