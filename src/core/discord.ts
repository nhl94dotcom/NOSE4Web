// A list of a ROM's hacks as a Discord post: a heading, a line for each, and
// what the editor could not read.
export function discordPost(name: string, lines: string[], unread: string[]): string {
  const post = [`**Hacks in ${name}**`]
  post.push(...(lines.length > 0 ? lines : ['None: it plays as the original game.']))
  if (unread.length > 0) post.push(`Also changed, in code NOSE4Web does not know: ${unread.join(', ')}.`)
  return post.join('\n')
}
