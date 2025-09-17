import React from 'react';

const styles = {
  logo: {
    height: '1.5em',
    marginRight: '0.4em',
    verticalAlign: 'text-bottom',
    display: 'inline-block'
  },
  brand: {
    color: 'inherit',
    textDecorations: 'none',
    fontSize: 'large'
  }
}

export const TransitiveLogo = ({alignment}) =>
  <div style={{...styles.brand, textAlign: alignment || 'center'}}> 
    <a href={location.origin.replace('portal.', '')}>
      <img src='/logo.svg' title='Transitive Robotics' style={styles.logo} />
    </a>
    portal
  </div>
;