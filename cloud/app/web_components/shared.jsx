import React, { useState, useEffect, useContext } from 'react';

import { Button, Accordion, AccordionContext, Card, Badge }
from 'react-bootstrap';

const styles = {
  badge: {
    width: '4em'
  }
};

const levelBadges = [
  <Badge variant="success" style={styles.badge}>OK</Badge>,
  <Badge variant="warning" style={styles.badge}>Warn</Badge>,
  <Badge variant="danger" style={styles.badge}>Error</Badge>,
  <Badge variant="secondary" style={styles.badge}>Stale</Badge>,
];

/** The right badge for the level */
export const LevelBadge = ({level}) => levelBadges[level];
