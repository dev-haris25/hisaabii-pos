/**
 * Print routes are rendered by Puppeteer at a ~1000px viewport. Lock UI scale to 1
 * so PDF output matches intended A4 proportions.
 */
export default function PrintLayout({ children }) {
  return (
    <>
      <style>{`
        :root {
          --hisabi-ui-scale: 1 !important;
        }
        body {
          background-color: #ffffff !important;
          margin: 0;
          padding: 0;
        }
      `}</style>
      {children}
    </>
  )
}
