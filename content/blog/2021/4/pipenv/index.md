---
title: Pipenv - Yep, another post about Python Virtual Environments
date: "2021-04-07T12:12:03.284Z"
description: Venv... the best way?
---

Virtual environments have always been one of those areas of constant discovery as I've learned python. I've been writing on articles what, how, and why of Virtual Environments and you can find those articles here:

- [Part I: VirtualEnv & Pyenv](https://tuts.alexmercedcoder.com/2021/1/pythonvirtualenv/)
- [Part II: Built-in Virtual Env Generator](https://tuts.alexmercedcoder.com/2021/3/rivisitingpyenv/)

While all of these work great for isolating dependencies and outputting dependencies to a requirements.txt allow use to track dependencies one piece is still missing, deterministic dependency resolution.

When working with NodeJS or Yarn you may notice a .lock file that gets generated when installing libraries, ever wondered what it did? The lock file not only tracks dependencies but also tracks the dependencies of those dependencies so that way if two libraries you use have the underlying dependency that it isn't downloaded multiple times allowing for a faster installation and more consistent reproduction of your environment.

To have this type of feature in Python we will need to use Pipenv to handle our virtual environments! (yep, another venv option, but quite possibly the best one!)

## Setup

First, you got to install pipenv.

```
pip install pipenv
```

## Generating a Virtual Environment

In any folder that you're creating a project for run the following command (similar npm init)

```
pipenv shell
```

This will generate a virtual environment along with the following after you install your first package:

- pipfile: list of dependencies and package info like Package.json for node or Cargo.toml for Rust
- Pipfile.lock: File dependency resolution

** Note if you've created a virtual environment in this directory already it will instead activate it instead of creating a new one.

## Install Libraries

To install libraries your command will look a little different...

```
pipenv install packageName
```

## Learn More

- [Great Article on Pipenv](https://realpython.com/pipenv-guide/)