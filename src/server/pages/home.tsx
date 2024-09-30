import Counter from "./../components/counter.tsx"

type HomeProps = {
  ESBUILD_SCRIPT_BUNDLE_PATH: string
  ESBUILD_STYLE_BUNDLE_PATH: string
  counter: number 
}

function Home({ ESBUILD_SCRIPT_BUNDLE_PATH, ESBUILD_STYLE_BUNDLE_PATH, counter }: HomeProps) {
  return(<>
    {"<!DOCTYPE html>"}
    <html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <link rel="stylesheet" type="text/css" href={ESBUILD_STYLE_BUNDLE_PATH} />
        <script src={ESBUILD_SCRIPT_BUNDLE_PATH}></script>
        <title>lambda-pi-sigma</title>
        <meta name="description" content="Welcome to lambda-pi-sigma - λambda Πolarity Σtack (Lambda Polarity Stack)"></meta>
    </head>
    <body>
      <div class="flex flex-col items-center justify-center h-screen">
        <h1 class="text-4xl font-bold mb-8">welcome to lambda-pi-sigma</h1>
        <p class="text-lg mb-12">Our λambda Πolarity Σtack (Lambda Polarity Stack)</p>
        <Counter counter={counter} />
      </div>
    </body>
    </html>
  </>)
}

export default Home
