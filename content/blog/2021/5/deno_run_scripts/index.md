---
title: Creating Deno Scripts Like Node NPM Scripts
date: "2021-05-19T12:12:03.284Z"
description: Replicating One of Nodes Greatest Features
---

One of the greatest features of NodeJS is the package.json file. The file not only tracks dependencies but also allows us to easily create scripts as easy as writing some JSON.

```json
"scripts": {
  "start": "NODE_ENV=development PORT=5000 node server.js",
  "dev":"NODE_ENV=development PORT=5000 nodemon server.js"
}
```

So instead of typing those long commands you could instead say `npm start` or `npm run dev`. This allowed very verbose commands to be easy to use.

Deno JS, the newer Rust based secure Javscript runtime that provides first class support for typescript is great and offers lots of benefits:

- Being in written in Rust, it's super fast
- Having first class support for Typescript makes working with Typescript easier than ever.
- By defaulting to as little access to hardware as possible you don't have to worry about unexpected scripts messing with your files, running processes or using you network in unexpected ways.

That catch... verbose commands.

So I want to run a file that can use env variables, run shell commands and use the internet... the command would be...

`deno run --allow-net --allow-run --allow-env index.ts`

You could just use the --allow-all flag, but then you lose the security deno offers. In a situation like this, an NPM Scripts like tool would be great but unfortunately there isn't one.

Options:

1. You could use shell scripts, but of course there is differences between scripts for PowerShell or Bash.

2. You could use other languages to write scripts, but still just another thing other people who use your code have to install.

3. You could use a library, but seems like overkill to bring a whole library for a few basic commands.

**Solution:**

Here is a template I made for a basic scripts file. Has more of a python "manage.py" feel, but still better than nothing.

```ts
// command | deno run --allow-run scripts.ts <script> |

// save the script name in a variable
const scriptName = Deno.args[0]

// create a variable to hold the child process
let p;

// switch statement for each possible script
switch (scriptName) {

  case "start":
    // run a command
    p = Deno.run({ cmd: ["deno", "run", "file.ts"] });
    // process output when it completes
    await p.status()
    break;


  case "dev":
    p = Deno.run({
      cmd: ["deno", "run", "--allow-all", "./file.ts"],
    });
    await p.status()    
    break;

  // default output if not a script you made  
  default:
    console.log("No Script by that name");
}
```

In this case you'd just run `deno run --allow-run scripts.ts start` to run the start script. Still fairly verbose and maybe in the future a better built-in option will exist. 