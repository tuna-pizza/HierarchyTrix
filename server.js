import express from "express";
import fs from "fs";

const app = express();
const PORT = 3000;

// Serve static files from "public" (HTML, CSS, JS)
app.use(express.static("public"));

// Endpoint to return JSON data
app.get("/api/data", (req, res) => 
{
	try 
	{
		const jsonString = fs.readFileSync("sample.json", "utf8");
		const data = JSON.parse(jsonString);
		res.json(data);
	} 
	catch (err) 
	{
		res.status(500).json({ error: "Failed to read JSON file" });
	}
}
);

app.listen(PORT, () => 
{
  console.log(`✅ Server running at http://localhost:${PORT}`);
});