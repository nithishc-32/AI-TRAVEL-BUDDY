// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import fetch from "node-fetch";
import TripPlan from "./models/TripPlan.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

console.log("MONGODB_URI loaded:", process.env.MONGODB_URI ? "YES" : "NO");
console.log(
  "Mongo URI preview:",
  process.env.MONGODB_URI
    ? process.env.MONGODB_URI.slice(0, 25) + "..."
    : "EMPTY"
);

mongoose
  .connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000
  })
  .then(() => {
    console.log("✅ MongoDB connected");
    console.log("readyState:", mongoose.connection.readyState);
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });

mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose runtime error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB disconnected");
});

// Health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "AI Travel Buddy server is running",
  });
});

app.post("/api/travel-plan", async (req, res) => {
  try {
    const {
      days,
      budget,
      travelStyle,
      transportMode,
      interests,
      startingPoint,
      weather,
      stay,
      food,
      destinationType,
      purpose,
    } = req.body;

    console.log("Incoming request body:", req.body);

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Missing GEMINI_API_KEY in .env file",
      });
    }

    if (!days || !startingPoint || !purpose) {
      return res.status(400).json({
        success: false,
        error: "days, startingPoint, and purpose are required",
      });
    }

    const interestText = Array.isArray(interests)
      ? interests.join(", ")
      : interests || "Not specified";

    const prompt = `
You are an expert AI travel planner.

The user has NOT selected a destination.
Your job is to choose the BEST real destination based on the user's preferences, then build a complete travel plan for that destination.

Very important rules:
1. Choose ONE real destination only.
2. The destination must strongly match the user's budget, trip purpose, weather preference, travel style, transport mode, stay preference, food preference, and interests.
3. If destinationType is "domestic", choose a place in India.
4. If destinationType is "abroad", choose a place outside India.
5. Do NOT use fake places.
6. Do NOT repeat the same attractions.
7. Keep the trip practical and realistic.
8. Return ONLY valid JSON.
9. Do not include markdown, explanation, code fences, or notes.
10. Every property name and every string value must use double quotes.
11. Do not use trailing commas.
12. Escape any double quotes inside text values.
13. Do not default to Pondicherry or any other common place unless it is clearly the best match.
14. Use the full combination of user preferences to vary the destination.
15. All sections must be customized for the chosen destination: budget, itinerary, activities, stay, food, tips, packing, mapRoute, and alternatives.
16. Try to give a fresh and varied destination recommendation for different combinations of inputs.
17. If the user's choices are very different, the destination should also be very different.
18. The JSON must exactly match the format below.

User preferences:
- Starting point: ${startingPoint}
- Duration / days: ${days}
- Budget: ${budget || "Not specified"}
- Travel style: ${travelStyle || "Not specified"}
- Transport mode: ${transportMode || "Not specified"}
- Interests: ${interestText}
- Weather preference: ${weather || "Not specified"}
- Stay preference: ${stay || "Not specified"}
- Food preference: ${food || "Not specified"}
- Destination type: ${destinationType || "Not specified"}
- Purpose of trip: ${purpose || "Not specified"}

Return JSON in this exact structure:

{
  "destination": "string",
  "tagline": "string",
  "metaChips": ["string", "string", "string", "string", "string"],
  "from": "string",

  "budgetItems": [
    {
      "icon": "🚌",
      "label": "Transport",
      "amount": "₹4000",
      "note": "Approx round-trip cost"
    },
    {
      "icon": "🏨",
      "label": "Stay",
      "amount": "₹6000",
      "note": "Based on selected accommodation"
    },
    {
      "icon": "🍜",
      "label": "Food",
      "amount": "₹2500",
      "note": "Estimated meals"
    },
    {
      "icon": "🎟",
      "label": "Activities",
      "amount": "₹1500",
      "note": "Entry tickets and local experiences"
    }
  ],
  "budgetNote": "string",
  "totalBudget": "string",

  "itinerary": [
    {
      "day": 1,
      "title": "string",
      "description": "string",
      "activities": ["string", "string", "string"]
    }
  ],

  "activities": [
    {
      "icon": "🏖",
      "name": "string",
      "desc": "string"
    }
  ],

  "stayName": "string",
  "stayType": "string",
  "stayDesc": "string",
  "stayFeatures": ["string", "string", "string"],

  "foodTitle": "string",
  "foodPref": "string",
  "foodDesc": "string",
  "foodFeatures": ["string", "string", "string"],

  "mapRoute": "string",

  "tips": [
    {
      "icon": "💡",
      "title": "string",
      "body": "string"
    }
  ],

  "packing": [
    {
      "icon": "🎒",
      "name": "string"
    }
  ],

  "alternatives": [
    {
      "name": "string",
      "subtitle": "string",
      "desc": "string",
      "tags": ["string", "string"]
    }
  ]
}

Extra rules:
- "from" must be the user's starting point.
- "metaChips" should contain exactly 5 short UI-friendly chips.
- "budgetItems" should have 4 items exactly.
- "itinerary" should match the trip duration sensibly.
- "activities" should contain 4 to 8 items.
- "tips" should contain 4 to 6 items.
- "packing" should contain 5 to 10 items.
- "alternatives" should contain exactly 3 items.
- Use INR for domestic Indian trips.
- Use a suitable currency for international trips.
`;

    let response;
    let data;
    let success = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              maxOutputTokens: 4096,
              responseMimeType: "application/json"
            }
          }),
        }
      );

      data = await response.json();

      if (response.ok) {
        success = true;
        break;
      }

      const errMsg = (data?.error?.message || "").toLowerCase();

      if (
        (response.status === 429 ||
          response.status === 503 ||
          errMsg.includes("high demand")) &&
        attempt < 3
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
        continue;
      }

      return res.status(response.status || 500).json({
        success: false,
        error: data?.error?.message || "Gemini API request failed",
        raw: data,
      });
    }

    if (!success) {
      return res.status(500).json({
        success: false,
        error: "Gemini is busy right now. Please try again in a moment.",
      });
    }

    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const text = parts
      .map((part) => {
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();

    if (!text) {
      console.error("Gemini raw response:", JSON.stringify(data, null, 2));

      return res.status(500).json({
        success: false,
        error: candidate?.finishReason
          ? `Gemini returned no usable text. finishReason: ${candidate.finishReason}`
          : "No text returned from Gemini",
        raw: data,
      });
    }

    let cleanedText = text.trim();
    cleanedText = cleanedText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
    cleanedText = cleanedText.replace(/\s*```$/i, "");

    const jsonStart = cleanedText.indexOf("{");
    const jsonEnd = cleanedText.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      console.error("Gemini non-JSON response:", cleanedText);

      return res.status(500).json({
        success: false,
        error: "Gemini did not return a valid JSON object",
        aiText: cleanedText,
      });
    }

    const jsonText = cleanedText.slice(jsonStart, jsonEnd + 1);
    console.log("Gemini extracted JSON text:", jsonText);

    let parsedResult;

    try {
      parsedResult = JSON.parse(jsonText);
      console.log("AI destination selected:", parsedResult.destination);
      console.log("AI chips:", parsedResult.metaChips);
    } catch (parseError) {
      console.error("Gemini invalid JSON text:", jsonText);
      console.error("Parse error:", parseError.message);

      try {
        const repairedText = jsonText
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/\u0000/g, "");

        parsedResult = JSON.parse(repairedText);
      } catch (repairError) {
        return res.status(500).json({
          success: false,
          error: "Gemini returned invalid JSON",
          aiText: jsonText,
        });
      }
    }

    parsedResult.from = parsedResult.from || startingPoint;
    parsedResult.destination =
      parsedResult.destination || "Recommended Destination";
    parsedResult.tagline =
      parsedResult.tagline || "A personalized AI-picked getaway";
    parsedResult.metaChips = Array.isArray(parsedResult.metaChips)
      ? parsedResult.metaChips
      : [];
    parsedResult.budgetItems = Array.isArray(parsedResult.budgetItems)
      ? parsedResult.budgetItems
      : [];
    parsedResult.itinerary = Array.isArray(parsedResult.itinerary)
      ? parsedResult.itinerary.map((item, index) => ({
          day: item.day || `Day ${index + 1}`,
          title: item.title || "Plan",
          description: item.description || "",
          activities: Array.isArray(item.activities) ? item.activities : [],
          chips: Array.isArray(item.chips)
            ? item.chips
            : Array.isArray(item.activities)
            ? item.activities
            : [],
        }))
      : [];
    parsedResult.activities = Array.isArray(parsedResult.activities)
      ? parsedResult.activities
      : [];
    parsedResult.stayFeatures = Array.isArray(parsedResult.stayFeatures)
      ? parsedResult.stayFeatures
      : [];
    parsedResult.foodFeatures = Array.isArray(parsedResult.foodFeatures)
      ? parsedResult.foodFeatures
      : [];
    parsedResult.mapRoute =
      parsedResult.mapRoute || `${startingPoint} to ${parsedResult.destination}`;
    parsedResult.tips = Array.isArray(parsedResult.tips)
      ? parsedResult.tips
      : [];
    parsedResult.packing = Array.isArray(parsedResult.packing)
      ? parsedResult.packing
      : [];
    parsedResult.alternatives = Array.isArray(parsedResult.alternatives)
      ? parsedResult.alternatives
      : [];

    const savedTrip = await TripPlan.create({
      startingPoint,
      days,
      budget,
      travelStyle,
      transportMode,
      interests: Array.isArray(interests) ? interests : [],
      weather,
      stay,
      food,
      destinationType,
      purpose,
      generatedPlan: parsedResult
    });

    return res.json({
      success: true,
      plan: parsedResult,
      tripId: savedTrip._id
    });
  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
});

app.get("/api/saved-trips", async (req, res) => {
  try {
    console.log("readyState:", mongoose.connection.readyState);

    const trips = await TripPlan.find()
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      trips
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/saved-trips/:id", async (req, res) => {
  try {
    const trip = await TripPlan.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({
        success: false,
        error: "Trip not found"
      });
    }

    res.json({
      success: true,
      trip
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});