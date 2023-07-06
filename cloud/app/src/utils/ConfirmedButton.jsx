import React from 'react';

import { Button, OverlayTrigger, Popover } from 'react-bootstrap';
import { ActionLink } from './index.jsx';

const styles = {
  title: {
    fontSize: 'smaller',
    fontWeight: 'normal'
  },
  body: {
    fontSize: 'smaller'
  }
}

/** A reusable button that requires confirmation before executing onClick */
export const ConfirmedButton =
  ({style, variant, onClick, children, explanation, as, size}) => {
    const Comp = as || ActionLink;
    return <OverlayTrigger trigger="click" placement="bottom" rootClose
      overlay={
        <Popover id="popover-positioned-bottom" title="">
          <Popover.Body style={styles.body}>
            { explanation && <div>{explanation}</div> }
            <strong>Are you sure?</strong> <a onClick={onClick} href='#'>yes</a>
          </Popover.Body>
        </Popover>
      }
    >
      <Comp variant={variant || 'danger'} style={style} href='#' size={size}>
        {children}
      </Comp>
    </OverlayTrigger>;
  };
