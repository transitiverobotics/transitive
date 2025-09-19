import React from "react";
import {Dropdown } from 'react-bootstrap';
import { FaEllipsisH } from 'react-icons/fa';

const F = React.Fragment;

export const CollapsibleButtonList = ({children, dropdownClassName = ''}) =>
  <F>
    {/* for small screens we use a dropdown */}
    <Dropdown className={`d-lg-none ${dropdownClassName}`}>
      <Dropdown.Toggle variant="secondary" size='sm'>
        <FaEllipsisH />
      </Dropdown.Toggle>

      <Dropdown.Menu>
        {React.Children.map(children, (child, i) =>
          <Dropdown.Item key={i} as="div">
            {child}
          </Dropdown.Item>
        )}
      </Dropdown.Menu>
    </Dropdown>
    {/* for large screens we just show the children */}
    <div className='d-none d-lg-inline'>
      {children}
    </div>
  </F>
;