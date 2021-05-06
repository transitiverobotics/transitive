import React, { useState, useEffect, useContext } from 'react';

import { Button, Accordion, AccordionContext, Card, Badge }
from 'react-bootstrap';

const styles = {
  badge: {
    width: '4em'
  },
  code: {
    color: '#700',
    borderLeft: '3px solid #aaa',
    padding: '0.5em 0px 0.5em 2em',
    backgroundColor: '#f0f0f0',
    borderRadius: '4px',
    marginTop: '0.5em',
  },
  inlineCode: {
    color: '#700',
    margin: '0px 0.5em 0px 0.5em',
  }
};

const levelBadges = [
  <Badge variant="success" style={styles.badge}>OK</Badge>,
  <Badge variant="warning" style={styles.badge}>Warn</Badge>,
  <Badge variant="danger" style={styles.badge}>Error</Badge>,
  <Badge variant="secondary" style={styles.badge}>Stale</Badge>,
];

/** The right badge for the level */
export const LevelBadge = ({level}) => levelBadges[level] || <span>{level}</span>;

/** reusable component for showing code:
  TODO: this is copied from portal, share it somehow
*/
export const Code = ({children}) => <pre style={styles.code}>
  {children}
</pre>;

export const InlineCode = ({children}) => <tt style={styles.inlineCode}>
  {children}
</tt>;
