export function resolvePostContent(post) {
  return post?.original ?? post ?? {};
}