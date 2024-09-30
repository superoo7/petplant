const { createClient, newSignatureProvider } = require("postchain-client");

const signnatureProvider = newSignatureProvider({
  privKey: "0101010101010101010101010101010101010101010101010101010101010101",
});
const localClient = "http://localhost:7740";

let cachedClient = null;

async function createLocalClient() {
  if (cachedClient) {
    return cachedClient;
  }
  const client = await createClient({
    nodeUrlPool: [localClient],
    blockchainIid: 0,
  });
  cachedClient = client;
  return client;
}

async function waterPlant() {
  const client = await createLocalClient();
  await client.signAndSendUniqueTransaction(
    {
      name: "water_plant",
      args: [],
    },
    signnatureProvider
  );
}

async function getPoints() {
  const addr = "031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f";
  const client = await createLocalClient();
  return (await client.query({
    name: "get_points",
    args: {
      addr,
    },
  }))[0];
}

module.exports = {
  waterPlant,
  getPoints,
};