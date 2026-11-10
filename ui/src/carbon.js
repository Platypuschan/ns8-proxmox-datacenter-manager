//
// Copyright (C) 2023 Nethesis S.r.l.
// SPDX-License-Identifier: GPL-3.0-or-later
//
import {
  CvAccordion,
  CvAccordionItem,
  CvCheckbox,
  CvColumn,
  CvContent,
  CvForm,
  CvGrid,
  CvLink,
  CvRadioButton,
  CvRadioGroup,
  CvRow,
  CvSideNav,
  CvSideNavItems,
  CvSideNavLink,
  CvSkeletonText,
  CvStructuredList,
  CvStructuredListData,
  CvStructuredListHeading,
  CvStructuredListItem,
  CvTextInput,
  CvTile,
  CvToggle,
} from "@carbon/vue";

// Only the Carbon Vue components used by this module are registered
const components = {
  CvAccordion,
  CvAccordionItem,
  CvCheckbox,
  CvColumn,
  CvContent,
  CvForm,
  CvGrid,
  CvLink,
  CvRadioButton,
  CvRadioGroup,
  CvRow,
  CvSideNav,
  CvSideNavItems,
  CvSideNavLink,
  CvSkeletonText,
  CvStructuredList,
  CvStructuredListData,
  CvStructuredListHeading,
  CvStructuredListItem,
  CvTextInput,
  CvTile,
  CvToggle,
};

export function registerCarbonComponents(app) {
  for (const [name, component] of Object.entries(components)) {
    app.component(name, component);
  }
}
