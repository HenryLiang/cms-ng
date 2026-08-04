# 媒体库标签全文检索(P2):官方 Elasticsearch + IK 中文分词插件(决策 D7)
#
# 版本双锁硬要求:ES 与 IK 必须同版本,否则插件加载失败。
# IK 为社区插件,不在 Elastic 官方 registry,须从 infinilabs 官方 CDN 拉取
# (release.infinilabs.com 即 medcl/analysis-ik 迁移后的官方分发点)。
FROM docker.elastic.co/elasticsearch/elasticsearch:8.11.0

RUN elasticsearch-plugin install --batch \
    https://release.infinilabs.com/analysis-ik/stable/elasticsearch-analysis-ik-8.11.0.zip
