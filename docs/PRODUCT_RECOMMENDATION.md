# Cartography pipeline: recommendation and validation plan

Date: 9 September 2026

## Recommendation

**Pursue a bounded commercial validation phase before committing to building a business. Make a paid pilot the next milestone.**

The product combines attractive cartography, fully automated generation for arbitrary areas, and performant WebGL interaction. That combination warrants further investigation. We have not yet established a customer problem strong enough to support payment.

## What supports pursuing it

The Grand Canyon screenshot shows a coherent palette, detailed terrain, readable destination labels, and effective landscape labeling. Against the specific QGIS hiking example examined, its presentation looks substantially more polished.

A screenshot comparison also leaves out much of the product: automated generation and interactive performance. Those capabilities belong in the evaluation alongside appearance.

The current assessment accepts the creator’s description of full automation, geographic generality, and performance. We have not independently benchmarked those capabilities across regions, devices, or competing systems.

## What the comparison established

- **QGIS Zugspitze hiking example:** heavy hillshade, busy land-cover textures, and weak label contrast make the output look muddier than the Grand Canyon example. Its trail highlighting is useful. This is a comparison with one author’s styling, not QGIS’s quality ceiling.
- **MAPublisher Ouray example:** demonstrates clean automatic labeling after styles and rules are configured. It does not establish fully automatic production of the entire map or superiority over this pipeline.
- **MAPublisher + FME cycling-map production case:** demonstrates substantial automation, but explicitly includes finishing edits.
- **Interactivity:** both QGIS and MAPublisher have ways to produce zoomable web maps. Zoomability alone is not unique. Equivalent visual quality, automation, label behavior, and performance have not been demonstrated in a controlled comparison.

These findings support a credible product hypothesis. They do not establish a defensible advantage or willingness to pay.

## Next steps

### 1. Publish a live demonstration

Show several contrasting regions, including steep mountains, dense trail networks, forested terrain, and areas with sparse source data. Use the same automated process and disclose any manual intervention.

Let visitors pan and zoom directly. Show enough variety to judge consistency beyond the Grand Canyon example. Check performance on an ordinary phone as well as a desktop.

### 2. Test against real map-production work

Approach people who already produce outdoor maps: publishers, trail organizations, and outdoor websites. Treat these as candidate customer groups, not validated buyers.

Ask them to supply an area and an existing map or concrete requirement. Generate the result and learn:

- Whether they would use it in actual work.
- What would prevent them from publishing or deploying it.
- How much correction or customization they require.
- Whether it improves a task they already spend time or money on.

Avoid assuming that their current tools are inadequate. A preference for the appearance alone does not establish a business opportunity.

### 3. Offer a paid pilot

Define a small deliverable using the customer’s real requirements, with an agreed price and acceptance criteria. Record the time spent on data preparation, corrections, styling, and delivery.

The key question is whether someone pays for an output the pipeline can produce repeatably without extensive custom work.

## Decision criteria

**Continue commercial development** if customers pay, use the output, and request further work that the automated pipeline can serve economically.

**Reconsider the product direction** if buyers pay only for substantial bespoke cartography. That would be evidence for a service business, with different economics.

**Pause commercial development** if people praise the maps but consistently prefer their existing workflow and decline concrete paid offers.

The technical achievement and the commercial decision are separate. The work can remain valuable even if this validation does not establish a business.

## References

- QGIS hiking-map image: https://raw.githubusercontent.com/hauke96/qgis-outdoor-map/main/example-hiking-map.jpg
- QGIS hiking-map project and workflow: https://github.com/hauke96/qgis-outdoor-map
- MAPublisher Ouray labeling demonstration: https://www.avenza.com/resources/2021/03/04/labelling-made-easy-with-mapublisher-label-tools-and-the-mapublisher-labelpro-add-on/
- MAPublisher + FME production case: https://fme.safe.com/blog/2023/04/a-5-step-cartography-guide-by-red-geographics/
- QGIS web export: https://plugins.qgis.org/plugins/qgis2web/
- MAPublisher HTML5 export: https://support.avenza.com/hc/en-us/articles/360044082071-Export-to-HTML5
