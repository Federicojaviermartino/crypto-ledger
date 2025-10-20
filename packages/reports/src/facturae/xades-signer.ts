import * as crypto from 'crypto';
import { create } from 'xmlbuilder2';

export class XadesSigner {
  constructor(
    private certificatePath?: string,
    private certificatePassword?: string
  ) {}

  async sign(xml: string): Promise<string> {
    // In production, use proper XAdES signing library (e.g., node-xades)
    // For now, add basic signature placeholder
    
    if (!this.certificatePath) {
      // Return unsigned XML
      return xml;
    }

    // Calculate digest
    const digest = crypto
      .createHash('sha256')
      .update(xml)
      .digest('base64');

    // Insert signature block before closing Facturae tag
    const signatureBlock = this.createSignatureBlock(digest);
    const signedXml = xml.replace('</fe:Facturae>', signatureBlock + '</fe:Facturae>');

    return signedXml;
  }

  private createSignatureBlock(digest: string): string {
    const signature = create({ version: '1.0' })
      .ele('ds:Signature', {
        'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      })
      .ele('ds:SignedInfo')
      .ele('ds:CanonicalizationMethod', {
        Algorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      })
      .up()
      .ele('ds:SignatureMethod', {
        Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      })
      .up()
      .ele('ds:Reference')
      .ele('ds:DigestMethod', {
        Algorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      })
      .up()
      .ele('ds:DigestValue')
      .txt(digest)
      .up()
      .up()
      .up()
      .ele('ds:SignatureValue')
      .txt('PLACEHOLDER_SIGNATURE')
      .up()
      .ele('ds:KeyInfo')
      .ele('ds:X509Data')
      .ele('ds:X509Certificate')
      .txt('PLACEHOLDER_CERTIFICATE')
      .up()
      .up()
      .up();

    return signature.end({ prettyPrint: true });
  }
}
