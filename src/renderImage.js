const five = require("johnny-five");
const Oled = require("oled-js");
const pngtolcd = require("png-to-lcd");

const oledAddress = 0x3c; // I2C Address for OLED

const board = new five.Board();

const imagePath = (id) => `resized_plant${id}.png`;

board.on("ready", async () => {
  console.log("Board is ready");

  // Initialize the OLED display with the I2C bus
  const oled = new Oled(board, five, {
    width: 128,
    height: 64,
    address: oledAddress,
  });

  oled.clearDisplay();
  oled.update();

  for (let i = 1; i < 5; i++) {
    console.log(`Rendering image ${i}`);
    try {
      await renderImage(i, oled);
    } catch (error) {
      console.error(`Error rendering image ${i}:`, error);
    }
  }
});

/**
 * Renders an image on the OLED display.
 * @param {number} id - The image identifier.
 * @param {Oled} oled - The OLED display instance.
 * @returns {Promise<void>}
 */
function renderImage(id, oled) {
  return new Promise((resolve, reject) => {
    const path = imagePath(id);
    pngtolcd(path, true, (err, bitmap) => {
      if (err) {
        return reject(err);
      }

      // Update the OLED buffer with the bitmap
      oled.setCursor(0, 0);
      oled.buffer = bitmap;

      setTimeout(() => {
        oled.update();
        resolve()
      }, 2000);
    });
  });
}