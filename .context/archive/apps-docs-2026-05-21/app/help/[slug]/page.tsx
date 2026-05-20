import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { MDXRemote } from "next-mdx-remote/rsc"

import { Doc } from "@/components/doc"
import { listContent, loadContent } from "@/lib/content"

export const dynamic = "force-static"
export const dynamicParams = false

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return listContent("help").map((p) => ({ slug: p.slug }))
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params
  const page = loadContent("help", slug)
  if (!page) return {}
  return {
    title: page.frontmatter.title,
    description: page.frontmatter.description,
  }
}

export default async function HelpPage(props: Props) {
  const { slug } = await props.params
  const page = loadContent("help", slug)
  if (!page) notFound()
  return (
    <Doc title={page.frontmatter.title} intro={page.frontmatter.intro}>
      <MDXRemote source={page.body} />
    </Doc>
  )
}
