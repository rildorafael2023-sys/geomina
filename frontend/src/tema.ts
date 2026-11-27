import { Badge, Button, Card, Drawer, Modal, NavLink, Paper, SegmentedControl, Table, Tabs, Tooltip, createTheme, type MantineColorsTuple } from "@mantine/core";

/** Azul-petróleo do GeoMina: cor principal de ações, seleção e links. */
const geo: MantineColorsTuple = ["#e8f3f8", "#d3e5ee", "#a6cadd", "#76adcb", "#4f95bc", "#3786b3", "#287eaf", "#1d6a8a", "#145f80", "#004f6e"];
/** Cinza-ardósia neutro para interface técnica. */
const ardosia: MantineColorsTuple = ["#f4f6f8", "#e9edf1", "#d5dbe1", "#b9c2cc", "#9aa6b2", "#7d8a98", "#5c6875", "#434e5a", "#2c3640", "#17212b"];

/** Fonte do sistema: Segoe UI no Windows, sem depender de internet. */
const FONTE = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

export const tema = createTheme({
  primaryColor: "geo",
  primaryShade: 7,
  colors: { geo, ardosia },
  fontFamily: FONTE,
  fontFamilyMonospace: 'Consolas, "Cascadia Mono", Menlo, monospace',
  headings: { fontFamily: FONTE, fontWeight: "600", sizes: { h1: { fontSize: "22px" }, h2: { fontSize: "20px" }, h3: { fontSize: "18px" }, h4: { fontSize: "15px" }, h5: { fontSize: "13px" }, h6: { fontSize: "12px" } } },
  fontSizes: { xs: "11px", sm: "12.5px", md: "13.5px", lg: "15px", xl: "18px" },
  lineHeights: { xs: "1.35", sm: "1.4", md: "1.45", lg: "1.5", xl: "1.5" },
  spacing: { xs: "6px", sm: "10px", md: "14px", lg: "18px", xl: "24px" },
  radius: { xs: "2px", sm: "3px", md: "4px", lg: "6px", xl: "8px" },
  defaultRadius: "sm",
  shadows: { xs: "none", sm: "0 1px 2px rgba(23,33,43,.06)", md: "0 4px 14px rgba(23,33,43,.12)", lg: "0 8px 24px rgba(23,33,43,.16)", xl: "0 12px 32px rgba(23,33,43,.2)" },
  cursorType: "pointer",
  components: {
    Button: Button.extend({ defaultProps: { size: "xs" } }),
    Badge: Badge.extend({ defaultProps: { radius: "sm", variant: "light" }, styles: { root: { textTransform: "none", fontWeight: 600, letterSpacing: 0 } } }),
    Paper: Paper.extend({ defaultProps: { radius: "sm" } }),
    Card: Card.extend({ defaultProps: { radius: "sm", withBorder: true, shadow: "none" } }),
    Table: Table.extend({
      defaultProps: { verticalSpacing: 4, horizontalSpacing: 8, fz: "sm", highlightOnHover: true },
      styles: { th: { fontWeight: 600, color: "var(--gm-texto-2)", whiteSpace: "nowrap", background: "var(--gm-cabecalho)" } },
    }),
    Tabs: Tabs.extend({ styles: { tab: { fontWeight: 500, fontSize: "var(--mantine-font-size-sm)", padding: "7px 12px" } } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { size: "xs" } }),
    Tooltip: Tooltip.extend({ defaultProps: { withArrow: true, openDelay: 300, fz: "xs" } }),
    Modal: Modal.extend({ defaultProps: { radius: "sm", overlayProps: { backgroundOpacity: 0.35 } }, styles: { title: { fontWeight: 600 } } }),
    Drawer: Drawer.extend({ styles: { title: { fontWeight: 600 } } }),
    NavLink: NavLink.extend({ styles: { label: { fontSize: "var(--mantine-font-size-sm)" } } }),
    TextInput: { defaultProps: { size: "xs" } },
    NumberInput: { defaultProps: { size: "xs" } },
    Select: { defaultProps: { size: "xs" } },
    MultiSelect: { defaultProps: { size: "xs" } },
    Textarea: { defaultProps: { size: "xs" } },
    PasswordInput: { defaultProps: { size: "xs" } },
    DateInput: { defaultProps: { size: "xs" } },
    Checkbox: { defaultProps: { size: "xs" } },
    Switch: { defaultProps: { size: "xs" } },
    FileInput: { defaultProps: { size: "xs" } },
    Autocomplete: { defaultProps: { size: "xs" } },
  },
});
