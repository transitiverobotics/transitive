const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const client = new SESClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'AKIARVG4HDENT5QTP56A',
    secretAccessKey: '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',
  }
});

/** From
https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ses/classes/sendemailcommand.html
*/
const sendEmail = async ({to, subject, body}) => {
  const input = { // SendEmailRequest
    Source: 'support@transitiverobotics.com',
    Destination: {
      ToAddresses: [to],
    },
    Message: { // Message
      Subject: {
        Data: subject,
        Charset: 'utf-8',
      },
      Body: {
        Text: {
          Data: body,
          Charset: 'utf-8',
        },
        // Html: {
        //   Data: "STRING_VALUE", // required
        //   Charset: "STRING_VALUE",
        // },
      },
    },
    // ReplyToAddresses: [
    //   "STRING_VALUE",
    // ],
    // ReturnPath: "STRING_VALUE",
    // SourceArn: "STRING_VALUE",
    // ReturnPathArn: "STRING_VALUE",
    // Tags: [ // MessageTagList
    //   { // MessageTag
    //     Name: "STRING_VALUE", // required
    //     Value: "STRING_VALUE", // required
    //   },
    // ],
    // ConfigurationSetName: "STRING_VALUE",
  };
  console.log('sendEmail', input);
  const command = new SendEmailCommand(input);
  const response = await client.send(command);
  console.log('response', response);
};

module.exports = {sendEmail};