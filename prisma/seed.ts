import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { defaultSettings, defaultOffices, defaultServices, defaultBlocks } from "../src/lib/defaults";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "intubemediaofficial@gmail.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD env var is required to seed the admin user");

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { role: "admin", status: "approved", shareData: true },
    create: { email, password: hash, name: "Bainsla Music Admin", role: "admin", status: "approved", shareData: true, approvedAt: new Date() },
  });
  console.log(`Admin user ready: ${email}`);

  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.siteSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  console.log(`Settings: ${Object.keys(defaultSettings).length} keys`);

  if ((await prisma.office.count()) === 0) {
    await prisma.office.createMany({ data: defaultOffices });
    console.log(`Offices: ${defaultOffices.length}`);
  }

  if ((await prisma.service.count()) === 0) {
    await prisma.service.createMany({ data: defaultServices });
    console.log(`Services: ${defaultServices.length}`);
  }

  if ((await prisma.block.count()) === 0) {
    await prisma.block.createMany({ data: defaultBlocks });
    console.log(`Blocks: ${defaultBlocks.length}`);
  }

  if ((await prisma.blogPost.count()) === 0) {
    await prisma.blogPost.create({
      data: {
        title: "Welcome to the Bainsla Music blog",
        slug: "welcome-to-bainsla-music",
        excerpt:
          "News, guides and insights on music distribution, YouTube growth, digital rights and technology from the Bainsla Music team.",
        category: "Company",
        tags: "bainsla music, announcement",
        author: "Bainsla Music Team",
        published: true,
        publishedAt: new Date(),
        content: `<h2>Hello from Jaipur</h2>
<p>Bainsla Music is a music, media and technology company. On this blog we will share practical guides on <strong>music distribution</strong>, <strong>YouTube CMS &amp; Content ID</strong>, digital marketing, SEO, artist management and the technology we build — including our own micro drama app.</p>
<h3>What to expect</h3>
<ul>
<li>Release strategy and playlist pitching tips</li>
<li>Protecting and monetising your catalogue on YouTube</li>
<li>Behind the scenes of our products</li>
</ul>
<blockquote>Have a topic you want us to cover? <a href="/contact">Get in touch</a>.</blockquote>`,
      },
    });
    console.log("Blog: sample post");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
