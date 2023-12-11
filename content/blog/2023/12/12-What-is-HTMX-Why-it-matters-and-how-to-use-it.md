---
title: What is HTMX? Why it Matters? and How to use it.
date: "2023-11-30"
description: "The framework that is getting all the buzz about reducing the javascript you need to write"
author: "Alex Merced"
category: "HTML"
bannerImage: "https://i.imgur.com/cpoMZQ8.png"
tags:
  - HTML
  - Javascript
---

In the early days of web development, server-side templating was the cornerstone of website creation, offering a straightforward approach to generating dynamic web pages. Technologies like PHP, Ruby on Rails, and ASP.NET enabled developers to create rich, interactive user experiences. However, the web development landscape evolved, and a significant shift occurred towards client-side rendering. Frameworks such as React, Angular, Svelte, Vue, Qwik, and SolidJS gained popularity for their ability to create highly interactive and responsive user interfaces directly in the browser.

This client-side revolution brought about a new era of web development, but it also introduced complexities, especially for developers who preferred working with server-side languages like Python, Ruby, PHP, Go, and Rust. These developers sought ways to create dynamic user experiences without diving deep into JavaScript.

Enter HTMX, a contemporary solution bridging this gap. HTMX enables developers to create rich, interactive web interfaces using HTML, with minimal JavaScript. It leverages the power of HTML to handle most frontend rendering logic, swapping out chunks of HTML dynamically in response to server requests. This approach simplifies the process of updating web pages with new content, enabling smooth transitions and loaders with minimal coding. HTMX's philosophy aligns with the desires of many non-JavaScript developers, offering a path to modern web development that is both accessible and powerful.

## Illustrating the HTMX Way

#### Basic Workflow of HTMX:

HTMX fundamentally changes the way web interactions are handled. It works by partially updating the HTML of a page in response to user actions, without needing a full page reload. This process is achieved through attributes in HTML that define how and where to fetch new content from the server.

##### 1. Initial HTML Document (Before Click):

```html
<button hx-get="/morecontent" hx-target="#content">Load More</button>
<div id="content">Initial Content</div>
```

This HTML snippet shows a button with HTMX attributes. hx-get specifies the URL to fetch data from, and hx-target indicates where to place the response.

##### 2. Server Response to "/morecontent" Get Request:

```html
<div>Newly fetched content goes here.</div>
```

This is a simple HTML block that the server will send as a response to the get request initiated by the HTMX-enabled button.

##### 3. Final HTML Document (After HTMX Swap):

```html
<button hx-get="/morecontent" hx-target="#content">Load More</button>
<div id="content">Newly fetched content goes here.</div>
```

After the button is clicked, HTMX seamlessly swaps the innerHTML of the #content div with the response from the server.

### Backend Flexibility:

This HTMX approach allows all the business logic, HTML construction, and data fetching to be managed by the server-side language and backend framework of your choice. It simplifies the frontend while maintaining a dynamic user experience, making it an ideal choice for teams looking to focus on server-side development without sacrificing frontend interactivity.

## How to Set Up HTMX

To integrate HTMX into an HTML document, you need to add a script tag that links to the HTMX library. This can be done by including the following line in the HTML:

```html
<script src="https://unpkg.com/htmx.org@1.9.9"></script>
```

Place this script tag ideally in the head section of your HTML to ensure HTMX functionalities are loaded before any content. For consistency across multiple pages, you can use blocks or partials in your server-side templating language. This method allows you to insert the HTMX script tag into a shared layout or template, ensuring that it's automatically included at the top of every page. This approach simplifies maintenance and ensures uniformity across your web application.

## The Basics

HTMX is built around a set of primary attributes that enable dynamic interactions with web content. Understanding these attributes is key to leveraging HTMX effectively.

**hx-get/hx-put/hx-post/hx-delete:** These attributes define the HTTP method to be used when making a request to the server. For example, hx-get is used to retrieve data, hx-post to submit data, etc.

**hx-target:** This attribute specifies the element on the page where the response from the server will be displayed.

**hx-trigger:** Determines what user action will trigger the HTMX request. Common triggers include click, hover, or focus.

**hx-swap:** Controls how the content returned from the server is inserted into the target element. Different values for hx-swap allow various effects like appending, prepending, or replacing the content.

#### Example Illustration:

Original HTML Code Block:

```html
<button hx-get="/fetchData" hx-target="#info" hx-trigger="click">
  Get Info
</button>
<div id="info">Initial Data</div>
```

Response from Server:

```html
<div>Updated Info</div>
```

Updated HTML Code Block (hx-swap options):

- `hx-swap="outerHTML"` replaces the entire #info div.
- `hx-swap="innerHTML"` replaces only the content inside the #info div.
- `hx-swap="beforebegin"` inserts before the #info div.
- `hx-swap="afterend"` inserts after the #info div.

Each hx-swap option alters the DOM in a distinct manner, allowing for versatile and dynamic page updates.

## Form Handling with HTMX

HTMX simplifies form handling by taking over the form submission logic. Using the hx-post attribute, HTMX can intercept a form submission and handle it asynchronously, updating only parts of the page without a full reload.

Example Walkthrough:

Original HTML Form:

```html
<form
  id="dataForm"
  hx-post="/submitForm"
  hx-trigger="submit"
  hx-target="#result"
>
  <input type="text" name="dataField" />
  <button type="submit">Submit</button>
</form>
<div id="result"></div>
```

Here, hx-post="/submitForm" tells HTMX to capture the form's submission and send it as an HTTP POST request to /submitForm.

Server Response:

```html
<div>Submission Received</div>
```

After Submission:

1. The server processes the form data.
   Responds with a confirmation message or updated content.

1. HTMX updates the specified target element (#result in this case) with the server's response.

This approach allows for seamless form submissions and real-time updates, greatly enhancing the user experience.

### HTMX Has a Bag of Goodies

HTMX offers several advanced features for enhancing user interaction:

- **`hx-vals`**: Sends additional JSON-encoded values with requests for dynamic data handling.
- **`hx-include`**: Controls which elements' values are included in a request, offering precision in data submission.
- **`hx-select`**: Targets specific parts of the server response for DOM insertion, allowing for focused content updates.
- **CSS Classes (`htmx-request` and `htmx-settling`)**: These are applied during requests and content updating. Use them for creating smooth transitions and visual effects, providing feedback during data loading and swapping.

## Conclusion

HTMX emerges as a revolutionary tool in the web development landscape, bridging the gap between server-side efficiency and client-side interactivity. By empowering developers to create rich, responsive web interfaces with minimal JavaScript, HTMX aligns perfectly with the modern trends in web development. Its approach of leveraging HTML for dynamic content updating, coupled with its simplicity and flexibility, makes HTMX particularly appealing for developers inclined towards server-side languages. HTMX, with its unique features and easy integration, stands out as a significant enabler for crafting compelling web experiences while simplifying the development process.
