// Required Modules
const five = require("johnny-five");
const Oled = require("oled-js");
const font = require("oled-font-5x7");
const pngtolcd = require("png-to-lcd");
const OpenAI = require("openai");
const { waterPlant, getPoints } = require("./chromia"); // Ensure these functions are correctly exported

// Pin Definitions
const oledAddress = 0x3c; // I2C Address for OLED
const btnPin = 2; // Button Pin

// Initialize Board
const board = new five.Board();

// Plant Stages (Including Blooming)
let plantStages = [
  {
    state: 1,
    name: "Seed",
    image: "resized_plant1.png",
    requiredPoints: 0,
    story: "",
  },
  {
    state: 2,
    name: "Sprout",
    image: "resized_plant2.png",
    requiredPoints: 10,
    story: "",
  },
  {
    state: 3,
    name: "Young Plant",
    image: "resized_plant3.png",
    requiredPoints: 25,
    story: "",
  },
  {
    state: 4,
    name: "Mature Plant",
    image: "resized_plant4.png",
    requiredPoints: 50,
    story: "",
  },
];

// Initialize Variables
let plantState = 1; // Will be set via getPoints
let points = 0; // Will be set via getPoints

// Flag to prevent overlapping operations
let isRendering = false;
const textDelay = 5000;

// Image Cache
const imageCache = {};

// Initialize OpenAI
const ai = new OpenAI({
  baseURL: "https://orchestrator.chasm.net/v1", // Chasm offers very lenient API rate limits without API Key!
  apiKey: "",
});

// Function to Fetch Plant Data Using `getPoints`
async function fetchPlantData() {
  try {
    const data = await getPoints();
    points = data.points;
    const stageName = data.stage;
    const stage = plantStages.find(
      (s) => s.name.toLowerCase() === stageName.toLowerCase().replace("_", " ")
    );
    if (stage) {
      plantState = stage.state;
    } else {
      console.warn(`Stage name "${stageName}" not found in plantStages.`);
      // Optionally, set to default if stage not found
      plantState = 1;
      points = 0;
    }
  } catch (error) {
    console.error("Error fetching plant data:", error);
    // Assign default values if fetching fails
    points = 0;
    plantState = 1;
  }
}

// Function to Preload Images
function preloadImages(stages) {
  const preloadPromises = stages.map((stage) => {
    return new Promise((resolve, reject) => {
      pngtolcd(stage.image, true, (err, bitmap) => {
        if (err) {
          console.error(`Error loading image ${stage.image}:`, err);
          reject(err);
        } else {
          imageCache[stage.state] = bitmap;
          resolve();
        }
      });
    });
  });

  return Promise.all(preloadPromises);
}

// Function to Render Plant on OLED
function renderPlant(oled, state = 1) {
  const bitmap = imageCache[state];
  if (!bitmap) {
    console.error(`Bitmap for state ${state} not found.`);
    oled.setCursor(0, 6);
    oled.writeString(font, 1, `Image Missing!`, 1, true);
    return;
  }

  oled.buffer = bitmap;
  oled.update();

  oled.setCursor(0, 0);
  oled.writeString(font, 1, `Pts: ${points}`, 1, true);
}

// Function to Update Plant State Based on Points
function updatePlantState(oled) {
  let newState = plantState;

  // Determine the new state based on points
  for (let i = plantStages.length - 1; i >= 0; i--) {
    if (points >= plantStages[i].requiredPoints) {
      newState = plantStages[i].state;
      break;
    }
  }

  // If plant state has changed, update it
  if (newState !== plantState) {
    plantState = newState;
    const plantStage = plantStages[newState - 1];
    displayMessage(oled, `Plant is now a ${plantStage.name}!`, () => {
      displayMessage(
        oled,
        plantStage.story,
        () => {
          renderPlant(oled, plantState);
        },
        textDelay
      );
    });
  } else {
    renderPlant(oled, plantState); // Re-render to update points and progress bar
  }
}

// Function to Display Temporary Messages on OLED
function displayMessage(oled, message, callback, timeout = 2000) {
  oled.clearDisplay();
  oled.setCursor(0, 2);
  oled.writeString(font, 1, message, 1, true);
  setTimeout(() => {
    if (callback) callback();
  }, timeout); // Display message for the specified timeout
}

// Function to Log Messages on OLED (Renamed for Clarity)
function loggingOled(oled, message) {
  oled.clearDisplay();
  oled.update();
  oled.setCursor(0, 0);
  oled.writeString(font, 1, message, 1, true);
}

// Initialize Board
board.on("ready", async () => {
  console.log("Board is ready");

  // Initialize OLED Display
  const options = {
    width: 128,
    height: 64,
    address: oledAddress,
  };
  const oled = new Oled(board, five, options);

  try {
    loggingOled(oled, "Planting Seed...");

    // Display Blockchain Logging Message
    loggingOled(oled, "Logging Blockchain data...");

    // Fetch initial points and state
    await fetchPlantData();

    // Display AI Heating Message
    loggingOled(oled, "Heating up AI...");

    try {
      console.log("Fetching AI-generated stories...");
      const completion = await ai.chat.completions.create({
        temperature: 0.9,
        model: "gemma2-9b-it",
        response_format: {
          type: "json_object",
        },
        stream: false,
        messages: [
          {
            role: "system",
            content: `Act as a professional short story teller that speaks like shakespear, create a creative and interesting short stories of a plant growing from Seed, Sprout, Young Plant then into Mature Plant in 4 short sentences.

Here are the rules:
- The stories should be creative and interesting.
- keep each line within 12 words.
- Make sure there is only 4 stories.
- No pre-amble. 
- The response should be in JSON only. 
- This is the data structure of the response:
interface JSONResponse {
  stories: string[];
}
    `,
          },
        ],
      });
      const choices = completion.choices || completion.result.choices;
      let content = choices[0].message.content.replace("```json", "").replace("```", "").trim();
      console.log(content);
      try {
        content = JSON.parse(content).stories;
      } catch (parseError) {
        console.error("Error parsing AI response:", parseError);
        content = plantStages.map((stage) => `Story for ${stage.name}`);
      }

      // Assign stories to plantStages
      plantStages = plantStages.map((stage, index) => ({
        ...stage,
        story: content[index] || `Story for ${stage.name}`,
      }));

      console.log("AI-generated stories:", content);
    } catch (error) {
      console.error("Error fetching AI-generated stories:", error);
      // Assign default stories if AI fails
      plantStages = plantStages.map((stage) => ({
        ...stage,
        story: `Story for ${stage.name}`,
      }));
    }

    // Preload Images
    try {
      console.log("Preloading images...");
      await preloadImages(plantStages);
      console.log("Images preloaded successfully");
    } catch (error) {
      console.error("Error preloading images:", error);
      loggingOled(oled, "Image Load Error!");
    }

    // Initial Render with Story
    displayMessage(
      oled,
      plantStages[plantState - 1].story,
      () => {
        renderPlant(oled, plantState);
      },
      textDelay
    );

    // Initialize Water Button with Debounce and Pull-Up
    const waterButton = new five.Button({
      pin: btnPin,
      isPullup: false, // Enable internal pull-up resistor
      debounce: 150, // Debounce time in ms
    });

    // Button Event Listener
    waterButton.on("down", async () => {
      if (isRendering) {
        console.log("Render in progress, ignoring button press");
        return; // Prevent if already rendering
      }
      isRendering = true;

      try {
        console.log("Water button pressed");
        await waterPlant(); // Update backend
        console.log("Plant watered successfully");

        // Fetch updated points and state after watering
        await fetchPlantData();
        console.log(`Updated Points: ${points}, Updated State: ${plantState}`);

        // Update Plant State and Display Messages
        updatePlantState(oled);
        displayMessage(
          oled,
          "You watered the plant!",
          () => {
            isRendering = false;
          },
          2000
        );
      } catch (error) {
        console.error("Error during watering process:", error);
        isRendering = false;
      }
    });

    console.log("Setup complete");
  } catch (err) {
    console.error("Error during board setup:", err);
  }
});

// Function to fetch plant state and points using getPoints
async function fetchPlantData() {
  try {
    const data = await getPoints();
    points = data.points;
    const stageName = data.stage;
    const stage = plantStages.find(
      (s) => s.name.toLowerCase() === stageName.toLowerCase().replace("_", " ")
    );
    if (stage) {
      plantState = stage.state;
    } else {
      console.warn(`Stage name "${stageName}" not found in plantStages.`);
      // Optionally, set to default if stage not found
      plantState = 1;
      points = 0;
    }
  } catch (error) {
    console.error("Error fetching plant data:", error);
    // Assign default values if fetching fails
    points = 0;
    plantState = 1;
  }
}

/**
 * Renders the plant image, points, and update the OLED display.
 * @param {Oled} oled - The OLED display instance.
 * @param {number} state - Current state of the plant.
 */
function renderPlant(oled, state = 1) {
  const bitmap = imageCache[state];
  if (!bitmap) {
    console.error(`Bitmap for state ${state} not found.`);
    oled.setCursor(0, 6);
    oled.writeString(font, 1, `Image Missing!`, 1, true);
    return;
  }

  oled.buffer = bitmap;
  oled.update();

  oled.setCursor(0, 0);
  oled.writeString(font, 1, `Pts: ${points}`, 1, true);
}

/**
 * Updates the plant's state based on the current points.
 * @param {Oled} oled - The OLED display instance.
 */
function updatePlantState(oled) {
  let newState = plantState;

  // Determine the new state based on points
  for (let i = plantStages.length - 1; i >= 0; i--) {
    if (points >= plantStages[i].requiredPoints) {
      newState = plantStages[i].state;
      break;
    }
  }

  // If plant state has changed, update it
  if (newState !== plantState) {
    plantState = newState;
    const plantStage = plantStages[newState - 1];
    displayMessage(oled, `Plant is now a ${plantStage.name}!`, () => {
      displayMessage(
        oled,
        plantStage.story,
        () => {
          renderPlant(oled, plantState);
        },
        textDelay
      );
    });
  } else {
    renderPlant(oled, plantState); // Re-render to update points and progress bar
  }
}

/**
 * Displays a temporary message on the OLED display.
 * @param {Oled} oled - The OLED display instance.
 * @param {string} message - Message to display.
 * @param {Function} callback - Callback function to execute after the message is displayed.
 * @param {number} timeout - Time in milliseconds to display the message
 */
function displayMessage(oled, message, callback, timeout = 2000) {
  oled.clearDisplay();
  oled.setCursor(0, 2);
  oled.writeString(font, 1, message, 1, true);
  setTimeout(() => {
    if (callback) callback();
  }, timeout); // Display message for the specified timeout
}

/**
 * Logs messages on the OLED display.
 * @param {Oled} oled - The OLED display instance.
 * @param {string} message - Message to display.
 */
function loggingOled(oled, message) {
  oled.clearDisplay();
  oled.update();
  oled.setCursor(0, 0);
  oled.writeString(font, 1, message, 1, true);
}
