import tempfile
import unittest
import zipfile
from pathlib import Path

from server import presentation_preview


class PresentationPreviewTests(unittest.TestCase):
    def test_pptx_slides_are_extracted_in_order(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "slides.pptx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("ppt/presentation.xml", """<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="1" r:id="rId1"/></p:sldIdLst><p:sldSz cx="1000" cy="562"/></p:presentation>""")
                archive.writestr("ppt/_rels/presentation.xml.rels", """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>""")
                archive.writestr("ppt/slides/slide1.xml", """<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="100" y="100"/><a:ext cx="800" cy="200"/></a:xfrm><a:solidFill><a:srgbClr val="112233"/></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="2400"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Бірінші слайд</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>""")
            preview = presentation_preview(path, "resource")
            self.assertEqual(len(preview["slides"]), 1)
            self.assertEqual(preview["slides"][0]["elements"][0]["text"], "Бірінші слайд")
            self.assertEqual(preview["slides"][0]["elements"][0]["fill"], "#112233")


if __name__ == "__main__":
    unittest.main()
