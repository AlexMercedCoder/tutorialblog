---
tags:
  - "data engineering"
  - "data lakehouse"
  - "dremio"
author: "Alex Merced"
title: "Parquet File Compression for Everyone (zstd, brotli, lz4, gzip, snappy)"
date: "2023-06-19T12:12:03.284Z"
category: "data engineering"
bannerImage: "/images/postbanner/2023/dremio-arch.png"

---

You know how when you're packing for a trip, you try to stuff as many clothes as you can into your suitcase without breaking the zipper? That's kind of like data compression in the big data universe. We've got a massive amount of data being pulled in from all corners, and we have to find a way to fit it into our digital suitcases without paying excess baggage fees or slowing down our journey.

## Data Compression

Data compression is like that magical vacuum bag that shrinks your clothes down without making them disappear. You still have your favorite Hawaiian shirt; it takes up less space in your luggage. This space-saving technique is critical in our data-centric world for a few reasons.
First, it's like a ticket to getting extra room in your suitcase. In our data-heavy world, storage space can be as costly as an overpriced minibar. Compressing data let us cram more stuff in the same suitcase.

Second, it's like catching a faster plane. As data travels across networks, being smaller lets it sprint through cyberspace, dodging slow-loading websites and data traffic, enhancing the performance of your system. Especially in distributed computing environments where data zips between different nodes faster than you can say 'packet loss'.

Third, it's like getting to the front of the queue at the airport check-in. When data is compressed, it's more nimble, leading to faster reads and writes and, hence, faster data processing.

## Data Compression Codecs

Now, how do we go about squeezing our data? We've got a few tricks up our sleeve, and these are some of the crowd favorites: Zstandard (Zstd), Brotli, LZ4, GZip, and Snappy.

### zstd

Think of Zstandard (Zstd) as a compression ninja. It's flexible, giving you a range of options for how much you want to shrink your data while being quick about it. It's like if you could choose whether to fold, roll, or vacuum pack your clothes depending on what works best.

### brotli

Then there's Brotli. If Zstd is a ninja, Brotli is the scholar. It's particularly good with text data. It's like having a bookworm who knows precisely how to fit more books in your bag.

### lz4

Next up is LZ4, the speed demon of the group. It's all about going fast, making it the perfect choice when running late for your data flight.

### Gzip

GZip is your reliable, been-there-done-that friend. It's one of the oldest and most commonly used codecs. Like that old suitcase you can't bear to part with, it strikes a nice balance between speed and compression.

### Snappy

And lastly, there's Snappy. True to its name, it's fast. It's not too bothered about achieving the maximum compression; instead, it's focused on high speeds and 'good enough' compression, especially with bigger data sizes.

### Which is the Right one?

Choosing the correct compression codec is like choosing the right suitcase for a trip. You need to think about what you're packing, how much you're willing to carry, and how fast you need to move.

Got a lot of text data? Brotli might be your guy. Or, if you're racing against the clock, LZ4 or Snappy could be more your speed. If you're reading more than writing, a codec that can squeeze that data down, like Zstd or Brotli, could save you a lot of effort. But if you're constantly updating your data wardrobe, a speedier option like LZ4 or Snappy would suit you better.

You'll also need to consider your travel route. If your data is always on the move, a codec with a high compression ratio could save you data miles. It's always good to try on different codecs with some sample data to see which fits best. You wouldn't buy a suitcase without checking if it can fit your stuff, right?

And let's not forget to check if your codec is compatible with your data ecosystem. After all, getting a fancy new suitcase is no point if it doesn't fit in the overhead compartment. Keep an eye on storage costs, too. If you're in an environment where storage is as pricey as a first-class ticket, it might be worth investing in a high-compression codec.

Finally, remember that data volumes and needs change over time. Like you might need to switch from a carry-on to a check-in bag for a more extended trip, be ready to switch up your compression strategies as your data grows. And keep an eye on updates and improvements in the world of compression. You never know when a new, better suitcase might come along!

Remember, there's no one-size-fits-all in the world of data compression. It's all about finding the perfect fit for your data needs!