const axios = require("axios");
const querystring = require("querystring");
const assets = Runtime.getAssets();

const { addParticipants, createExplorationMap } = require(assets[
  "/exploration.js"
].path);

function getDomainName(context, event) {
  let domainName = context.DOMAIN;
  if (domainName === undefined || domainName.startsWith("localhost")) {
    domainName = event.HostName;
  }
  return domainName;
}

function getNumbers(event) {
  const numberString = event.Numbers;
  return numberString.split(",").map((num) => num.trim());
}

function connectParticipant(
  context,
  number,
  recordingTrack,
  recordingStatusCallback
) {
  return client
    .conferences("Example Single Party Recording")
    .participants.create({
      from: context.TWILIO_NUMBER,
      to: number,
      record: true,
      recordingTrack,
      recordingStatusCallback,
    });
}

function connectParticipantOverride(
  context,
  number,
  recordingTrack,
  recordingStatusCallback
) {
  const confName = "OverriddenConference";
  // Maybe headers?
  return axios({
    method: 'post',
    url: `https://api.twilio.com/2010-04-01/Accounts/${context.ACCOUNT_SID}/Conferences/${confName}/Participants.json`,
    auth: {
      username: context.ACCOUNT_SID,
      password: context.AUTH_TOKEN
    },
    data: querystring.stringify({
      From: context.TWILIO_NUMBER,
      To: number,
      Record: true,
      RecordingTrack: recordingTrack,
      RecordingStatusCallback: recordingStatusCallback,
    })
  }).then(response => response.data)
  .then(participant => {
    console.log("Received", participant);
    participant.callSid = participant.call_sid;
    return participant;
  });
}


exports.handler = async (context, event, callback) => {
  try {
    const client = context.getTwilioClient();
    const domainName = getDomainName(context, event);
    const participantNumbers = getNumbers(event);
    const explorationMap = await createExplorationMap(client, context);
    const recordingStatusCallbackUrl = `https://${domainName}/recorded?ExplorationId=${explorationMap.sid}`;
    console.log(`Wiring up callback to ${recordingStatusCallbackUrl}`);
    const promises = participantNumbers.map((number) => {
      return connectParticipantOverride(context, number, "inbound", recordingStatusCallbackUrl);
    });
    const participants = await Promise.all(promises);
    // Add each call to the map
    await addParticipants(explorationMap, participants);
    // Redirect to the results page (for sharing)
    const response = new Twilio.Response();
    const resultsUrl = `https://${domainName}/results?ExplorationId=${explorationMap.sid}`;
    console.log(`Attempting to redirect to ${resultsUrl}`);
    response.setStatusCode(302);
    response.appendHeader("Location", resultsUrl);
    callback(null, response);
  } catch (err) {
    console.error(err);
    callback(err);
  }
};
