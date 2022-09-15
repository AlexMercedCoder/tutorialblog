---
title: Developer Team Work Best Practices (Git, Agile/Scrum/Kanban, CI/CD)
date: "2021-11-16T12:12:03.284Z"
description: How to be part of a developer team
---

## The Why?

So you've been learning how to code whether in college, in a bootcamp or self-taught and your thinking... "When I get hired... how do I work with other developers?". This article aims to help clear up a lot of the mystery around this topic with on caveat, the practices and standards can vary widely from workplace to workplace but this article should give you an idea of what to expect.

Here are some other resources I've created that should help you in understanding this topic.

- [Understand Git](https://tuts.alexmercedcoder.dev/2021/1/guidetogit/)
- [Group Developer Workflow Part 1](https://www.youtube.com/watch?v=llDIbfSrRB8)
- [Group Developer Workflow Part 2](https://www.youtube.com/watch?v=n1AfM6fuc9M&t=5s)

## The Two Main Branches

Generally there should be two primary branches in any git repo:

- main/master/prod/production: This branch is the code that actually used for the application that is served to the end user. A continuous deployment pipeline should be setup for this branch that auto deploys when updated. The only code that should be pulled/merge into this branch is complete, reviewed and tested code.

- dev/development/staging: This branch should be where completed but not yet released code should be collected. Often this branch has a staging deployment to have staging deploy of the application to see the unreleased code in action in a similar environment as the main/master branch.

## Your Ticket Branch

Everytime you take on a ticket (a unit of deliverable work) you should create a branch, the naming of the branch should follow some convention to make it easy to understand the scope of the branch.

**examples**

- `feature/chat` may be the name of a branch creating a new chat feature
- `fix/new-form-button` may be a branch where I'm fixing a bug with a button on a form for adding new items

One ticket, one branch. Once that work is done, you make the pull request so it can be reviewed and make a fresh branch for the next piece of work.

The question then becomes should the new branch be made from the dev or main branch, that will probably be best answered by the Agile methodology that you undertake.

## Agile

Agile is just an approach to project management where we move away from the old paradigm of a project starting and completing when all features have been added (leaving little room intermediate and feedback and lot of room for wasted time) to a paradigm of incremental releases. By first releasing the minimum viable product we take the advantage of getting to market faster, can receive feedback which can be used for future releases and can generate revenue earlier in the products lifecycle. With in the Agile umbrello there are many sub-paradigms (that of course also differ in application at different establishments).

#### SCRUM

When taking a scrum approach you work in sprints which cover a set period of time to complete a set amount of work (a handful of features/fixes you want to add). You do not release early, you do not do more work if done early. The reason this is important is that at the end of the sprint when the features are released you assess the result to see how the process can be improved for the next sprint (take on more or less work, improve processes). In this case you have releases happening on a set schedule and the goal is to optimize the quantity and quality of work during a sprint.

**In this situation:**

- you get assigned a ticket
- you pull down any changes made to the dev branch
- make your ticket branch off of the dev branch
- work on your code locally, then push up branch when complete (or at end of each day)
- before pull request pull down any changes to dev and update your ticket branch with a local merge
- make pull request from your ticket branch to dev, await review of pull
- more on to next ticket
- at end of sprint, changes collected in dev will be pulled into main and deployed

#### Kanban

When taking a kanban approach there are no sprints as features are released when completed. In this situation you aren't comparing the execution of several tickets within a sprint but the lifecycle of one ticket/feature. As each feature is released you assess the time it took to get done and how to improve the timeframe for a ticket to be completed.

**In this situation:**

- get assigned a ticket
- pull all updates to main branch
- make a ticket branch off of main
- complete work
- push up ticket branch when complete and/or periodically
- pull updates to main, merge into ticket branch
- push final updates then pull into dev for review in staging
- when complete make a pull from your branch to main (to release that one feature in isolation)

## CI/CD (Continuous Integration/Continuous Deployment)

A CI/CD pipeline should hopefully be setup which will speed up the productivity of the team, what is CI/CD? CI/CD is automating tasks like linting/testing/formatting/deployment in response to events like pull request or branch pushes.

This is usually done with the use of tools like Jenkins, CircleCI, Github Actions and so forth. An example would be setting up the following automation:

Trigger: making a pull request to the main branch

Actions Taken:

- auto-format code using prettier
- check for syntax and style errors using ESLint (reject push if errors/warnings found)
- run several unit tests (reject push if any test fails)
- assuming the push isn't rejected, deploy the code

This can be a boon to the speed at which new code can be added to the codebase, but requires good tests and good test coverage to be effective.

- [Github Lab Lessons on using Github Actions](https://lab.github.com/githubtraining/devops-with-github-actions)
- [Playlist on Testing and Debugging Javascript](https://www.youtube.com/playlist?list=PLY6oTPmKnKbbRBom0Txvg28C6EySkR6Vq)

## Other Important Teamwork Habits

- Daily Stands: Daily meetings where everyone stands and expresses 1. What they've been working on, 2. what they will be working on 3. Any blockers or opportunities

- Scrum/Kanban Board: A board often with a list of tasks in a backlog, that get assigned to a team member and moves to "in progress", then to "in review", then to "complete". The goal always is to move the tickets from the far left (backlog) to the far right (complete)

**Templates you can use in your team** -[AIRTABLE](https://airtable.com/shr60SohWPoKMqKSg) -[Google Sheets](https://docs.google.com/spreadsheets/d/1EkEDhjxSP-dncgimZ_C1QKKrsIwY4vPXk9lFkhWdvGY/edit?)usp=sharing -[Trello](https://trello.com/templates/project-management/project-management-1x4Uql2u)

## In Conclusion

Hopefully this helps understand a little more about working on a developer team. There are also several tools you should familiarize yourself with (bash, git, docker, etc.). Here is a playlist of videos to help you with that.

- [Playlist of Programmer Tools](https://www.youtube.com/playlist?list=PLY6oTPmKnKbYjGEm9nLowExbgkI-epIgg)
