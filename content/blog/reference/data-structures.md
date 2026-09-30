---
title: "Data Structures"
date: "2023-10-21T23:27:29-04:00"
description: "Data structures are fundamental constructs used to organize and store data in a computer's memory or storage."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

## Data Structures
Data structures are fundamental constructs used to organize and store data in a computer's memory or storage. They provide a way to efficiently access, manipulate, and manage data in various applications and algorithms. Data structures play a critical role in computer science and programming, as they influence the efficiency and effectiveness of software solutions.

### What Are Data Structures?
Data structures are containers that hold, organize, and manage data elements or values. They define how data is stored, retrieved, and operated upon within a program or algorithm. Data structures can be classified into two main categories: primitive data types and composite data types.

**Primitive Data Types:** These are the basic building blocks for data storage and include integer, floating-point, character, and Boolean types. They represent single values and are not considered traditional data structures.

**Composite Data Types:** These are more complex structures that can hold multiple data elements and are fundamental to data organization. Common composite data types include arrays, linked lists, stacks, queues, trees, graphs, and hash tables.

### Why Data Structures Matter
Data structures are essential in computer science and programming for several reasons:

**Efficient Data Storage:** Data structures enable efficient storage of large volumes of data, optimizing memory usage and reducing storage costs.

**Fast Data Retrieval:** Properly chosen data structures can significantly improve data retrieval and manipulation speeds, leading to faster algorithms and better program performance.

**Logical Organization:** Data structures provide a logical organization for data, making it easier for developers to understand, manage, and maintain complex systems.

**Algorithm Design:** Data structures play a crucial role in algorithm design. Different data structures are suited to different types of problems, and selecting the right one can lead to more efficient algorithms.

**Resource Optimization:** Data structures help manage system resources efficiently, which is crucial for embedded systems, real-time applications, and large-scale software.

**Abstraction:** Data structures abstract the underlying details of data storage, allowing developers to focus on high-level functionality without worrying about low-level storage concerns.

### Common Data Structures
There is a wide variety of data structures available, each designed for specific use cases. Some of the most common data structures include:

**Arrays:** Ordered collections of elements, each identified by an index or a key.

**Linked Lists:** A sequence of nodes, where each node points to the next node, forming a chain-like structure.

**Stacks:** A data structure that follows the Last-In-First-Out (LIFO) principle, commonly used for function call management and undo operations.

**Queues:** A data structure that follows the First-In-First-Out (FIFO) principle, often used for task scheduling and managing resources.

**Trees:** Hierarchical structures with a root node and child nodes, commonly used in hierarchical data representation and search algorithms.

**Graphs:** Networks of nodes (vertices) connected by edges, used for modeling relationships and solving graph-related problems.

**Hash Tables:** Data structures that use a hash function to map keys to values, providing fast data retrieval.

**Heaps:** Specialized trees used for priority queue implementations, including min-heaps and max-heaps.

**Sets:** Unordered collections of unique elements, used for tasks like storing distinct values.

**Dictionaries:** Key-value stores that allow efficient retrieval of values based on keys.

**Trie:** A tree-like structure used for efficient string storage and retrieval.

**Bloom Filters:** Space-efficient data structures used for approximate membership queries.

**Sparse Arrays:** Arrays optimized for memory efficiency when most elements are empty.

**Skip Lists:** Data structures that provide fast search, insertion, and deletion operations, often used as alternatives to balanced trees.

Bitmaps: Arrays of bits used to represent sets or efficiently store binary data.

**Union-Find:** Data structures for tracking and merging disjoint sets.

**B-trees:** Self-balancing trees used for indexing and file system design.

**Suffix Trees/Arrays:** Used for pattern matching and substring search in strings.

**Self-balancing Binary Search Trees (BSTs):** Trees like AVL trees and Red-Black trees that automatically balance themselves.

**Segment Trees:** Data structures used for range query operations on an array.

These data structures are the building blocks for designing efficient algorithms and solving various computational problems. Choosing the right data structure for a specific problem is a critical skill for software developers and computer scientists.

## JavaScript Data Structures and Examples
JavaScript, as a versatile language, provides support for implementing various data structures. In this section, we'll explore some common data structures, their purposes, and example implementations.

### 1. Arrays
Purpose: Arrays are ordered collections that store multiple values of different types. They are widely used for list-like data storage and manipulation.

Logic: Arrays use integer-based indices to access elements. Elements can be added, modified, or removed from an array.

```js
// Example implementation
const fruits = ["apple", "banana", "cherry"];
fruits.push("date"); // Add an element to the end
fruits[1] = "orange"; // Modify an element
fruits.pop(); // Remove the last element
```

### 2. Linked Lists
Purpose: Linked lists are linear data structures consisting of nodes. Each node contains data and a reference to the next node, forming a chain.

Logic: Linked lists allow dynamic insertion and deletion of elements. They are used in scenarios where efficient insertions and deletions are required.

```js
// Example implementation
class Node {
  constructor(data) {
    this.data = data;
    this.next = null;
  }
}

class LinkedList {
  constructor() {
    this.head = null;
  }

  append(data) {
    const newNode = new Node(data);
    if (!this.head) {
      this.head = newNode;
    } else {
      let current = this.head;
      while (current.next) {
        current = current.next;
      }
      current.next = newNode;
    }
  }

  remove(data) {
    if (!this.head) return;
    if (this.head.data === data) {
      this.head = this.head.next;
      return;
    }
    let current = this.head;
    while (current.next) {
      if (current.next.data === data) {
        current.next = current.next.next;
        return;
      }
      current = current.next;
    }
  }
}
```

#### 3. Stacks
Purpose: Stacks are linear data structures following the Last-In-First-Out (LIFO) principle. They are used for managing function calls, undo operations, and parsing expressions.

Logic: Elements are pushed onto the stack and popped off the stack. The last element pushed is the first to be popped.

```js
// Example implementation
class Stack {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
  }

  pop() {
    return this.items.pop();
  }

  peek() {
    return this.items[this.items.length - 1];
  }

  isEmpty() {
    return this.items.length === 0;
  }
}
```

### 4. Queues
Purpose: Queues are linear data structures following the First-In-First-Out (FIFO) principle. They are used for task scheduling, managing resources, and breadth-first search algorithms.

Logic: Elements are enqueued (added) at the rear and dequeued (removed) from the front.

```js
// Example implementation
class Queue {
  constructor() {
    this.items = [];
  }

  enqueue(item) {
    this.items.push(item);
  }

  dequeue() {
    return this.items.shift();
  }

  front() {
    return this.items[0];
  }

  isEmpty() {
    return this.items.length === 0;
  }
}
```

### 5. Trees (Binary Search Tree)
Purpose: Trees are hierarchical data structures used for efficient searching, sorting, and organizing data. Binary Search Trees (BSTs) maintain order for efficient retrieval.

Logic: BSTs have a root node with left and right subtrees. Nodes are ordered so that values in the left subtree are less than the root, and values in the right subtree are greater.

```js
// Example implementation
class Node {
  constructor(value) {
    this.value = value;
    this.left = null;
    this.right = null;
  }
}

class BinarySearchTree {
  constructor() {
    this.root = null;
  }

  insert(value) {
    const newNode = new Node(value);
    if (!this.root) {
      this.root = newNode;
    } else {
      this.insertNode(this.root, newNode);
    }
  }

  insertNode(node, newNode) {
    if (newNode.value < node.value) {
      if (!node.left) {
        node.left = newNode;
      } else {
        this.insertNode(node.left, newNode);
      }
    } else {
      if (!node.right) {
        node.right = newNode;
      } else {
        this.insertNode(node.right, newNode);
      }
    }
  }
}
```

### 6. Hash Tables (HashMaps)
Purpose: Hash tables are used to store key-value pairs, allowing for efficient data retrieval based on keys. They are commonly used for caching, data indexing, and implementing associative arrays.

Logic: Keys are hashed to determine their storage location in an array. Collisions are resolved using techniques like chaining or open addressing.

```js
// Example implementation
class HashTable {
  constructor(size = 53) {
    this.keyMap = new Array(size);
  }

  _hash(key) {
    let total = 0;
    const prime = 31;
    for (let i = 0; i < Math.min(key.length, 100); i++) {
      const char = key[i];
      const value = char.charCodeAt(0) - 96;
      total = (total * prime + value) % this.keyMap.length;
    }
    return total;
  }

  set(key, value) {
    const index = this._hash(key);
    if (!this.keyMap[index]) {
      this.keyMap[index] = [];
    }
    this.keyMap[index].push([key, value]);
  }

  get(key) {
    const index = this._hash(key);
    if (this.keyMap[index]) {
      for (const pair of this.keyMap[index]) {
        if (pair[0] === key) {
          return pair[1];
        }
      }
    }
    return undefined;
  }
}
```

### 7. Doubly Linked Lists
Purpose: Doubly linked lists are similar to singly linked lists but have two pointers per node, allowing for efficient traversal in both directions.

Logic: Each node has references to both the next and previous nodes. This structure is useful when you need bidirectional traversal.

```js
// Example implementation
class Node {
  constructor(data) {
    this.data = data;
    this.next = null;
    this.prev = null;
  }
}

class DoublyLinkedList {
  constructor() {
    this.head = null;
    this.tail = null;
  }

  append(data) {
    const newNode = new Node(data);
    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      newNode.prev = this.tail;
      this.tail.next = newNode;
      this.tail = newNode;
    }
  }
}
```

### 8. Graphs (Adjacency List)
Purpose: Graphs represent connections between nodes. Adjacency lists store these connections efficiently.

Logic: Each node in the graph maintains a list of its adjacent nodes. Graphs can be used for modeling networks, relationships, and more.

```js
// Example implementation
class Graph {
  constructor() {
    this.adjacencyList = {};
  }

  addVertex(vertex) {
    if (!this.adjacencyList[vertex]) {
      this.adjacencyList[vertex] = [];
    }
  }

  addEdge(vertex1, vertex2) {
    this.adjacencyList[vertex1].push(vertex2);
    this.adjacencyList[vertex2].push(vertex1);
  }
}
```

### 9. Priority Queues (Min-Heap)
Purpose: Priority queues are used when elements have associated priorities, and you need to access the element with the highest (or lowest) priority first.

Logic: Min-heaps, in particular, ensure that the minimum element is always at the root. Priority queues can be used in algorithms like Dijkstra's shortest path.

```js
// Example implementation
class PriorityQueue {
  constructor() {
    this.values = [];
  }

  enqueue(val, priority) {
    const newNode = new Node(val, priority);
    this.values.push(newNode);
    this.bubbleUp();
  }

  bubbleUp() {
    let idx = this.values.length - 1;
    const element = this.values[idx];
    while (idx > 0) {
      let parentIdx = Math.floor((idx - 1) / 2);
      let parent = this.values[parentIdx];
      if (element.priority >= parent.priority) break;
      this.values[parentIdx] = element;
      this.values[idx] = parent;
      idx = parentIdx;
    }
  }
}
```

### 10. Tries (Prefix Trees)
Purpose: Tries are used for efficient string searching and prefix-based operations. They are often employed in autocomplete systems and spell checkers.

Logic: Each node in the trie represents a character. Words or strings are stored by traversing the tree from the root to the leaf nodes.

```js
// Example implementation
class TrieNode {
  constructor() {
    this.children = {};
    this.isEndOfWord = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let node = this.root;
    for (const char of word) {
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
    }
    node.isEndOfWord = true;
  }

  search(word) {
    let node = this.root;
    for (const char of word) {
      if (!node.children[char]) return false;
      node = node.children[char];
    }
    return node.isEndOfWord;
  }

  startsWith(prefix) {
    let node = this.root;
    for (const char of prefix) {
      if (!node.children[char]) return false;
      node = node.children[char];
    }
    return true;
  }
}
```

### 11. Queue (using Arrays)
Purpose: Queues are used to manage data in a First-In-First-Out (FIFO) manner. They are useful for managing tasks that need to be processed in a specific order.

Logic: Arrays can be used as a simple queue by pushing elements to the back and shifting them from the front.

```js
// Example implementation
class Queue {
  constructor() {
    this.elements = [];
  }

  enqueue(element) {
    this.elements.push(element);
  }

  dequeue() {
    return this.elements.shift();
  }

  isEmpty() {
    return this.elements.length === 0;
  }
}
```


### 12. Stack (using Arrays)
Purpose: Stacks are used to manage data in a Last-In-First-Out (LIFO) manner. They are helpful for tasks like maintaining function call history.

Logic: Arrays can also be used as a simple stack by pushing and popping elements from the end.

```js
// Example implementation
class Stack {
  constructor() {
    this.elements = [];
  }

  push(element) {
    this.elements.push(element);
  }

  pop() {
    return this.elements.pop();
  }

  isEmpty() {
    return this.elements.length === 0;
  }
}
```


### 13. Bloom Filter
Purpose: Bloom filters are probabilistic data structures used to test whether an element is a member of a set. They are used in cases where false positives are acceptable.

Logic: A Bloom filter consists of an array of bits and multiple hash functions. Elements are hashed and set the corresponding bits to 1.

```js
// Example implementation
class BloomFilter {
  constructor(size, numHashFunctions) {
    this.size = size;
    this.numHashFunctions = numHashFunctions;
    this.bits = new Array(size).fill(false);
  }

  add(item) {
    for (let i = 0; i < this.numHashFunctions; i++) {
      const index = this._hash(item, i);
      this.bits[index] = true;
    }
  }

  contains(item) {
    for (let i = 0; i < this.numHashFunctions; i++) {
      const index = this._hash(item, i);
      if (!this.bits[index]) {
        return false;
      }
    }
    return true;
  }

  _hash(item, seed) {
    // Custom hash function (e.g., using murmur hash)
    return (hashResult % this.size);
  }
}
```

### 14. Circular Linked List
Purpose: A circular linked list is similar to a singly linked list, but the tail node points back to the head node. It can be used in situations where elements need to be processed in a circular manner.

Logic: The last node's next pointer points back to the first node, forming a loop.

```js
// Example implementation
class Node {
  constructor(data) {
    this.data = data;
    this.next = null;
  }
}

class CircularLinkedList {
  constructor() {
    this.head = null;
    this.tail = null;
  }

  append(data) {
    const newNode = new Node(data);
    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      newNode.next = this.head;
      this.tail.next = newNode;
      this.tail = newNode;
    }
  }
}
```

### 15. Disjoin Set
Purpose: A disjoint-set (or union-find) data structure is used to manage disjoint sets of elements. It's commonly used in algorithms involving connected components.

Logic: Elements are grouped into disjoint sets. The data structure provides methods to determine which set an element belongs to and merge sets.

```js
// Example implementation
class DisjointSet {
  constructor() {
    this.parent = {};
  }

  makeSet(item) {
    this.parent[item] = item;
  }

  find(item) {
    if (this.parent[item] === item) {
      return item;
    }
    return this.find(this.parent[item]);
  }

  union(item1, item2) {
    const root1 = this.find(item1);
    const root2 = this.find(item2);
    if (root1 !== root2) {
      this.parent[root1] = root2;
    }
  }
}
```