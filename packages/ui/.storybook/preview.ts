import type { Preview } from "@storybook/react"
import { withThemeByClassName } from "@storybook/addon-themes"
import "../src/styles/globals.css"

const preview: Preview = {
  parameters: {
    options: {
      storySort: {
        method: "alphabetical",
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    viewport: {
      viewports: {
        // iPhone (unique sizes, past 10 years)
        iPhone678: {
          name: "iPhone 6/7/8 (375x667)",
          styles: { width: "375px", height: "667px" },
        },
        iPhone678Plus: {
          name: "iPhone 6/7/8 Plus (414x736)",
          styles: { width: "414px", height: "736px" },
        },
        iPhoneX: {
          name: "iPhone X/XS/11 Pro/12-13 mini (375x812)",
          styles: { width: "375px", height: "812px" },
        },
        iPhoneXR: {
          name: "iPhone XR/11/XS Max (414x896)",
          styles: { width: "414px", height: "896px" },
        },
        iPhone12: {
          name: "iPhone 12/13/14 (390x844)",
          styles: { width: "390px", height: "844px" },
        },
        iPhone12ProMax: {
          name: "iPhone 12/13 Pro Max (428x926)",
          styles: { width: "428px", height: "926px" },
        },
        iPhone14Pro: {
          name: "iPhone 14 Pro/15/16 (393x852)",
          styles: { width: "393px", height: "852px" },
        },
        iPhone14ProMax: {
          name: "iPhone 14-15 Pro Max (430x932)",
          styles: { width: "430px", height: "932px" },
        },
        iPhone16ProMax: {
          name: "iPhone 16 Pro Max (440x956)",
          styles: { width: "440px", height: "956px" },
        },
        // Tablets
        iPadMini: {
          name: "iPad Mini (744x1133)",
          styles: { width: "744px", height: "1133px" },
        },
        iPad: {
          name: "iPad 10th gen (820x1180)",
          styles: { width: "820px", height: "1180px" },
        },
        iPadPro11: {
          name: 'iPad Pro 11" (834x1194)',
          styles: { width: "834px", height: "1194px" },
        },
        iPadPro13: {
          name: 'iPad Pro 13" (1024x1366)',
          styles: { width: "1024px", height: "1366px" },
        },
        // MacBook
        macBook13: {
          name: 'MacBook Air 13" (1470x956)',
          styles: { width: "1470px", height: "956px" },
        },
        macBook14: {
          name: 'MacBook Pro 14" (1512x982)',
          styles: { width: "1512px", height: "982px" },
        },
        macBook15: {
          name: 'MacBook Air 15" (1710x1112)',
          styles: { width: "1710px", height: "1112px" },
        },
        macBook16: {
          name: 'MacBook Pro 16" (1728x1117)',
          styles: { width: "1728px", height: "1117px" },
        },
        // Windows PC
        windowsLaptop: {
          name: "Windows Laptop (1366x768)",
          styles: { width: "1366px", height: "768px" },
        },
        windowsLaptopHD: {
          name: "Windows Laptop HD (1536x864)",
          styles: { width: "1536px", height: "864px" },
        },
        windowsFHD: {
          name: "Windows Full HD (1920x1080)",
          styles: { width: "1920px", height: "1080px" },
        },
        windowsQHD: {
          name: "Windows QHD (2560x1440)",
          styles: { width: "2560px", height: "1440px" },
        },
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: {
        light: "",
        dark: "dark",
        "blue-light": "theme-blue",
        "blue-dark": "theme-blue dark",
        "green-light": "theme-green",
        "green-dark": "theme-green dark",
      },
      defaultTheme: "light",
    }),
  ],
}

export default preview
