export function isAdImageUrl(value){
  return typeof value==='string'&&!/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(value)&&(/^\/(?:storage|ad-reference)\/[\w%./-]+$/.test(value)||/^\/api\/ad-resources\/batches\/[\w%-]+\/items\/[\w%-]+\/(?:versions\/\d+\/(?:image|thumbnail)|preview(?:\?thumbnail=1&v=[\w%.-]+)?)$/.test(value));
}
