const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const client = new SESClient({
  region: 'us-west-2',
  credentials: {
    accessKeyId: 'AKIARVG4HDENT5QTP56A',
    secretAccessKey: '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',
  }
});

/** From
https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ses/classes/sendemailcommand.html
*/
const sendEmail = async ({to, subject, text, html}) => {
  const input = { // SendEmailRequest
    Source: 'Transitive Robotics <support@transitiverobotics.com>',
    Destination: {
      ToAddresses: [to],
    },
    Message: { // Message
      Subject: {
        Data: subject,
        Charset: 'utf-8',
      },
      Body: (html ? {
          Html: { Data: html, Charset: 'utf-8' },
        } : {
          Text: { Data: text, Charset: 'utf-8' }
        }),
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
  const command = new SendEmailCommand(input);
  const response = await client.send(command);
  console.log('send email, response', response);
};

module.exports = {sendEmail};