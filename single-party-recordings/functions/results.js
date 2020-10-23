const assets = Runtime.getAssets();
const AccessToken = require("twilio/lib/jwt/AccessToken");
const { render } = require(assets["/templating.js"].path);

function createTokenForId(context, id) {
  console.log(`Generating token for ${id}`);
  const token = new AccessToken(
    context.ACCOUNT_SID,
    context.TWILIO_API_KEY,
    context.TWILIO_API_SECRET
  );
  const syncGrant = new AccessToken.SyncGrant({
    serviceSid: context.SYNC_SERVICE_ID,
  });
  token.addGrant(syncGrant);
  token.identity = id;
  return token.toJwt();
}


function getDomainName(context, event) {
  let domainName = context.DOMAIN;
  if (domainName === undefined || domainName.startsWith("localhost")) {
    domainName = event.hostName;
  }
  return domainName;
}

function getNumbers(event) {
  const numberString = event.Numbers;
  return numberString.split(",").map((num) => num.trim());
}

SYNC_MAP_TTL = 60 * 15;

async function createResultsMap(client, context) {
  return await client.sync.services(context.SYNC_SERVICE_ID).syncMaps().create({
    ttl: SYNC_MAP_TTL,
  });
}

exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const domainName = getDomainName(context, event);
  const participantNumbers = getNumbers(event);
  // Create Sync map
  const resultsMap = await createResultsMap(client, context);
  const promises = participantNumbers.map((number) => {
    return client
      .conferences("Example Single Party Recording")
      .participants.create({
        from: context.TWILIO_NUMBER,
        to: number,
        recording: true,
        recordingTrack: "inbound",
        recordingStatusCallback: `https://${domainName}/recorded`,
      });
  });
  const participants = await Promise.all(promises);
  // Add each call to the map
  // Render with the token and the map
  const token = createTokenForId(context, resultsMap.sid);
  const keyPromises = participants.map((participant) => {
    return resultsMap.syncMapItems.create({
      key: participant.callSid,
      data: {
        callSid: participant.CallSid,
      },
    });
  });
  await Promise.all(keyPromises);

  callback(
    null,
    render(context, {
      mapSid: resultsMap.sid,
      token
    })
  );
};
