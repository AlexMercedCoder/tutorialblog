---
title: Guide to JSON, YAML and TOML
date: "2022-05-15"
description: "Popular formats for configuration"
author: "Alex Merced"
category: "devops"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - devop
---

In many frameworks, tools and more you often have to write configuration files that are often in JSON, YAML or TOML format here are some examples.

- package.json (tracks dependencies for node)
- tsconfig.json (typescript configurations)
- cargo.toml (tracks depencies for rust projects)
- database.yaml (database configurations in Ruby of Rails projects)
- serverless.yaml (configure deployments using the serverless framework)

They all essentially do the same thing, denote key/value pair that can then be read by a parser in any programming language to configure what the tool or framework does.

## Seeing them at work

What we'll do is translate the following javascript object in JSON, YAML and TOML

```js
const config = {
  description: {
    name: "Alex Merced",
    age: 36,
    employer: "Dremio",
  },
  onlinePressence: {
    websites: ["devnursery.com", "grokoverflow.com", "alexmercedcoder.com"],
    twitter: ["alexmercedcoder", "amdatalakehouse"],
  },
};
```

## JSON

This will be the simplest since JSON stands for "Javascript Object Notation" it's meant to look a lot like a javascript object. A couple of differences:

- Key require quotations
- No trailing commas

```json
{
  "description": {
    "name": "Alex Merced",
    "age": 36,
    "employer": "Dremio"
  },
  "onlinePressence": {
    "websites": ["devnursery.com", "grokoverflow.com", "alexmercedcoder.com"],
    "twitter": ["alexmercedcoder", "amdatalakehouse"]
  }
}
```

Pretty straightforward, probably why in javascript tooling this is generally the go to format. The only real downside is the inability to inject variables or environmental variables.

## YAML

YAML stands for "Yet Another Markup Language", I would call this the python of markup languages as like Python it relies heavily on indentation.

```yaml
description:
    name: Alex Merced
    age: 36
    employer: Dremio

onlinePressence: 
    websites: 
        - devnursery.com
        - grokoverflow.com
        - alexmercedcoder.com
    twitter: 
        - alexmercedcoder
        - amdatalakehouse

```

YAML also does have access to environmental variables but does allow reuse of properties in several ways.

- `&property` and `<<: *property` to inject all the properties from object to another
- `{{property}}` to inject the value of one property as the value of another key

## TOML

TOML stands for "Toms Obvious Markup Language" and I most often see it used for Netlify configurations and Rust and I would categorize this the Ruby of config files with a simple syntax that doesn't rely on indentation.

```toml
[description]
name: "Alex Merced"
age: 36
employer: "Dremio"

[onlinePressence] 
websites: ["devnursery.com","grokoverflow.com","alexmercedcoder.com"]
twitter: ["alexmercedcoder", "amdatalakehouse"]
```

But yeah, that's all there is to it. Regardless which format we're talking about, these examples convey the same information. What values particular frameworks and languages look for is up to them, so you'll need to read their documentation but hopefully this helps.