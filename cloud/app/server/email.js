const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

const client = process.env.TR_AWS_ACCESS_KEY_ID &&
  process.env.TR_AWS_SECRET_ACCESS_KEY && new SESClient({
    region: 'us-west-2',
    credentials: {
      accessKeyId: process.env.TR_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.TR_AWS_SECRET_ACCESS_KEY,
    }
  });

/** From
https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-ses/classes/sendemailcommand.html
*/
const sendEmail = async ({to, subject, text, html}) => {
  if (!client) {
    console.log('email sending is disabled');
    return;
  }

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