import React from 'react';

import { Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import _ from 'lodash';

import {Fold} from './Fold';
import {Code} from './Code';

/** reusable embedding instructions */
export const Embed = ({name, jwt, deviceId, extra, style}) => {
  if (!jwt) {
    return <span></span>;
  }

  const jwtPayload = JSON.parse(atob(jwt.split('.')[1]));
  const url = new URL(location.href);
  // TODO: also allow hostname here instead of deviceId
  const params = `userId=${jwtPayload.id}&deviceId=${deviceId}`;
  const bundleURL =
    `${url.protocol}//${url.host}/bundle/${jwtPayload.capability}/${name}.js?${params}`;
  const jwtPayloadExample = Object.assign(jwtPayload, {
    userId: '[a string that uniquely identifies the current user]',
    validity: '[number of seconds this authentication should remain valid]',
  });
  delete jwtPayloadExample.iat;

  const optionalExtraParam = extra &&
    _.map(extra, (value, key) => `\n  ${key}=${JSON.stringify(value)}`) || '';

  return <Fold title='Embedding instructions' style={style}>
    <Form.Text style={{color: 'inherit'}}>
      To embed this widget in another page use:
      <Code >
        {`<script src="${bundleURL}"></script>\n<${name} id="${jwtPayload.id}"${optionalExtraParam} jwt="[JWT]" />`}
      </Code>
      where <tt>JWT</tt> is a <a href="https://jwt.io/">JWT token</a> signed
      with your JWT secret (see <Link to='/security'>Security</Link>), carrying
      the payload:
      <Code>
        {JSON.stringify(jwtPayloadExample, true, 2)}
      </Code>
      If you prefer, you can replace <tt>"device": "deviceId"</tt> with <tt>
        "hostname": "hostname of your device"</tt>.

      <div>
        For testing only you can use this ready-to-go snippet. The included JWT
        is valid for the next 12 hours from when this page was loaded.
        <Code>
          {`<script src="${bundleURL}"></script>\n<${name} id="${jwtPayload.id}"${optionalExtraParam} jwt="${jwt}"/>`}
        </Code>
      </div>
    </Form.Text>
  </Fold>;
};
