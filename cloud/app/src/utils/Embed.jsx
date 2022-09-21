import React, { useState } from 'react';

import { Form, InputGroup, FormControl, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import _ from 'lodash';

import {fetchJson} from '@transitive-sdk/utils-web';

import {Fold} from './Fold';
import {Code} from './Code';

const styles = {
  form: {maxWidth: '40em'}
};

/** reusable embedding instructions */
export const Embed = ({name, jwt, deviceId, extra, style, host, ssl}) => {
  if (!jwt) {
    return <span></span>;
  }

  const [tokenName, setTokenName] = useState('');
  const [password, setPassword] = useState('');
  const [link, setLink] = useState();

  const jwtPayload = JSON.parse(atob(jwt.split('.')[1]));
  const url = new URL(location.href);
  // TODO: also allow hostname here instead of deviceId
  const params = `userId=${jwtPayload.id}&deviceId=${deviceId}`;
  const currentHost = `${url.protocol}//${url.host}`;
  const bundleURL =
    `${currentHost}/running/${jwtPayload.capability}/dist/${name}.js?${params}`;
  const jwtPayloadExample = Object.assign(jwtPayload, {
    userId: '[a string that uniquely identifies the current user]',
    validity: '[number of seconds this authentication should remain valid]',
  });
  delete jwtPayloadExample.iat;

  const optionalExtraParam = extra &&
    _.map(extra, (value, key) => `\n  ${key}=${JSON.stringify(value)}`) || '';

  const createToken = () => {
    console.log({tokenName, password});
    fetchJson('/@transitive-robotics/_robot-agent/createCapsToken',
      (err, res) => {
        if (err) {
          alert(err);
        } else {
          setLink(`${currentHost}/sac/${jwtPayload.id}/${deviceId}/${jwtPayload.capability}/${name}?token=${tokenName}`);
        }
      },
      {body: {jwt, tokenName, password}});
  };

  return <Fold title='Embedding instructions' style={style}>
    <Form.Text style={{color: 'inherit'}}>
      To embed this widget in another page use:
      <Code >
        {`<script src="${bundleURL}"></script>\n<${name} id="${jwtPayload.id}"${optionalExtraParam} jwt="[JWT]" host="${host}" ssl="${ssl}" />`}
      </Code>
      where <tt>JWT</tt> is a <a href="https://jwt.io/">JWT token</a> signed
      with your JWT secret (see <Link to='/security'>Security</Link>), carrying
      the payload:
      <Code>
        {JSON.stringify(jwtPayloadExample, true, 2)}
      </Code>

      <div>
        For testing only you can use this ready-to-go snippet. The included JWT
        is valid for the next 12 hours from when this page was loaded.
        <Code>
          {`<script src="${bundleURL}"></script>\n<${name} id="${jwtPayload.id}"${optionalExtraParam} jwt="${jwt}" host="${host}" ssl="${ssl}"/>`}
        </Code>
      </div>

      <div>
        You can also share this widget on a stand-alone, password-protected page.
        To do that, set a name and password, then click "Get link".
        <Form action="#" onSubmit={(e) => {
          e.stopPropagation();
          e.preventDefault();
          createToken();
        }}>

          <InputGroup className="mb-3" size="sm" style={styles.form}>
            <FormControl
              placeholder="Name"
              aria-label="Name"
              value={tokenName}
              autoComplete="username"
              onChange={e => setTokenName(e.target.value)}
              />
            <FormControl
              type="password"
              placeholder="Set password"
              autoComplete="new-password"
              aria-label="Set password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              />
            <Button variant="secondary" id="b-addon2" onClick={createToken}>
              Get link
            </Button>
          </InputGroup>
          {link && <a href={link}>Link</a>}
        </Form>
      </div>
    </Form.Text>
  </Fold>;
};
