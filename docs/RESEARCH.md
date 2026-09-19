# Research and data evidence

Checked September 19, 2026. Public sources support the problem and the proposed data paths; they do not establish sponsor acceptance or a working implementation.

| Source | What it supports | Limitation |
| --- | --- | --- |
| [VTHacks 14 overview](https://vthacks-14.devpost.com/) | Current event and public prize/judging information | Several sponsor details remain TBD |
| [VTHacks 14 rules](https://vthacks-14.devpost.com/rules) | Four-person teams, event-period work, external-resource disclosure, contributor entries | Obtain sponsor-specific instructions separately |
| [VTHacks resources](https://vthacks-14.devpost.com/resources) | September 20, 10:00 a.m. EDT deadline and participant Discord direction | Follow official announcements for changes |
| [VT Accessibility Portal](https://accessibility.vt.edu/) | Existing campus accessibility mapping and support resources | Our value must extend the existing map |
| [VT GIS accessibility service](https://arcgis-central.gis.vt.edu/arcgis/rest/services/vtcampusmap/Accessibility/MapServer) | Queryable entrances, route geometry, and elevator layers | Public query availability is not a guarantee of freshness, topology, or redistribution rights |
| [VT campus impacts](https://www.facilities.vt.edu/campus-impacts.html) | Dated access-impact notices and official reporting/map links | Resolve each notice's validity before marking a current closure |
| [VT basic needs](https://dos.vt.edu/office/basicneeds.html) | Department and resources for food, equipment, and other support | No automatic eligibility or enrollment authority |
| [VT food security](https://dos.vt.edu/food_security.html) | University-stated food-insecurity problem | A problem statistic is not our project's measured impact |
| [The Market programs](https://foodaccess.vt.edu/programs.html) | Distinct food-access program models | Recheck schedules and capacity before recommendations |
| [Career Outfitters](https://career.vt.edu/channels/career-outfitters/) | Real career-preparation support program | Booking/Handshake access is separate |
| [Databricks Free Edition](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations) | Platform resource and connectivity constraints | Workspace capabilities still need an authenticated test |
| [Databricks signup choices](https://docs.databricks.com/aws/en/getting-started/free-trial-vs-free-edition) | Free Edition versus trial | Prefer sponsor provisioning when available |
| [Databricks SQL API](https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial) | External application query architecture | No SQL call has yet been made in a team workspace |
| [GoDaddy ANS guide](https://www.godaddy.com/hi-in/ans/developers) | Registry, DNS, certificates, resolution | Sponsor access and protocol implementation are unverified |
| [Gemini API key documentation](https://ai.google.dev/gemini-api/docs/api-key) | AI Studio project/key setup | Model availability and quotas need a live test |
| [Vultr Docker deployment](https://docs.vultr.com/how-to-use-vultrs-docker-marketplace-application) | Container-hosting option | No instance has been provisioned |

## Live read-only GIS probe

Metadata and `returnCountOnly` queries succeeded for:

| Layer | Geometry | Feature count |
| --- | --- | --- |
| 3: Accessible Entrances | Point | 583 |
| 4: Access Route | Polyline | 1,559 |
| 5: Elevators | Point | 230 |

Example reproducible count URL:

https://arcgis-central.gis.vt.edu/arcgis/rest/services/vtcampusmap/Accessibility/MapServer/4/query?where=1%3D1&returnCountOnly=true&f=json

Layer 4 exposes slope-category fields. Presence of a field does not mean every record has a reliable value. The map service reports a state-plane coordinate system, so request or explicitly transform geometries to WGS84 for display and use a suitable metric projection for distance calculations. Check pagination and service limits when extracting records. Do not ingest unnecessary asset/contact metadata from other layers.

Full geometry download, graph validation, data licensing review, and campus spot checks remain implementation tasks. No student information was accessed.
